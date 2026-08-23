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
// the LIBRARY's checkpoint set — the runner consumes it, so the tests read the
// same one rather than a literal that could drift from either
import { CHECKPOINT_OUTCOMES } from '../src/reuse.js';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;
const SPEC = JSON.parse(readFileSync(new URL('../jobs/bareagent-u-types.json', import.meta.url), 'utf8'));

// These tests spawn the REAL runner, which loads the REAL job spec — so `budgetUsd` and
// `maxWallMs` are LIVE operator numbers, re-signed whenever hamr changes the allowance
// (they were 8/45min on 2026-08-04, 4/25min after). A test that hardcodes today's value
// is not testing the runner, it is pinning an operator decision it has no business
// pinning: the scenarios below are "overspent by exactly $0.13" and "burnt past the
// wall", at ANY allowance. Every expected number is therefore DERIVED from SPEC, and
// every fixture is sized as a fraction of it, so a spec edit moves both together.
const BUDGET = SPEC.budgetUsd;
/** minutes, spelled the way the runner spells them (`${WALL_MS / 60000}min`) */
const WALL_MIN = SPEC.maxWallMs / 60_000;
/** SPEC-derived numbers land inside RegExps, where `$` and `.` are not literals */
const rx = (/** @type {string|number} */ s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** the runner prints dollars through `toFixed(4)`; expectations must be built the same way */
const usd = (/** @type {number} */ v) => rx(v.toFixed(4));

const base = mkdtempSync(join(tmpdir(), 'resume-u-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** a halted DIRECT spine, written to a real file the way the runner reads one */
function spineFile(events) {
  const f = join(base, `u-fixture-${n += 1}.jsonl`);
  writeFileSync(f, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return f;
}

const sum = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);

/** the shape a real halted U run leaves: job-start, a plan, a finished step, rounds,
 * and the terminal it stopped on. Only the fields the reader reads are spelled.
 * The default rounds are a FRACTION of the signed budget (a quarter of it), not a
 * dollar figure: the stock fixture must stay "a halt with allowance left" whatever
 * the operator has signed. */
const haltedSpine = ({ outcome = 'cap-halt', job = SPEC.job, rounds = [BUDGET * 0.15, BUDGET * 0.10], steps = ['fix-types'] } = {}) => [
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
const preview = (args, job = 'bareagent-types') => {
  const r = spawnSync(process.execPath, [RUNNER, '--job', job, ...args], {
    encoding: 'utf8', timeout: 240_000, env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) {
    throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error, no signal'}) — the runner rendered NO verdict, so nothing here is a reading of its behaviour. Output so far:\n${out.slice(0, 400)}`);
  }
  return { code: r.status, out };
};

test('§3 the resume PREVIEW states what is inherited: the fold, the remainder, and where it picks up', () => {
  const rounds = [BUDGET * 0.15, BUDGET * 0.10];
  const spent = sum(rounds);
  const f = spineFile(haltedSpine({ rounds }));
  const { code, out } = preview(['--resume', f]);
  assert.equal(code, 0, 'a preview with no --approve is a readout, not a refusal');
  assert.match(out, /RESUME/, 'it says plainly that this is a continuation, not a fresh run');
  assert.match(out, new RegExp(`\\$${usd(spent)} and .* before the halt — FOLDED IN`), 'the halted run\'s own priced rounds, summed');
  assert.match(out, new RegExp(`left {5}\\$${usd(BUDGET - spent)} of \\$${rx(BUDGET)}`), 'so what it may still spend is the REMAINDER of the signed budget');
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

test('§3 tripwire: the runner HANDS the replan ledger over too — the ceiling is the RUN\'s, and this is the U path\'s only forwarder', () => {
  // Same class as the tripwire above, with a sharper cost. An unforwarded grade seam
  // makes a READOUT wrong; an unforwarded replan ledger makes a BOUND wrong — the leg
  // opens with a ceiling the chain already spent, and PRD v1.12's "unlimited replanning
  // launders thrash as adaptation" is refilled once per kill. This script is the U
  // path's ONLY caller of runJob, so nothing else can catch it.
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /resumeReplans:\s*\{\s*count:\s*dead\.restart\.replans/,
    'the ledger the reader computed must reach runJob — computed-but-undelivered is a ceiling that reads spent and behaves fresh');
  assert.match(src, /grantUsed:\s*dead\.restart\.replanGrantUsed/,
    'and the F85-C latch travels with it, or the arbiter\'s ONE extra becomes one per kill');
});

test('§3 the resume PREVIEW names the replan ceiling it inherits — the operator is signing a leg that may not be allowed to redraw its plan', () => {
  // The preview is what hamr signs against, and an inherited ceiling changes what the
  // dollars being authorized can buy: a leg opening with both replans spent cannot
  // adapt its workflow at all, only exhaust the plan it reloads. Silence there reads
  // as a fresh allowance, which is exactly the state this whole seam exists to deny.
  const ev = haltedSpine();
  const withReplans = ev.flatMap((e) => (e.type !== 'plan-accepted' ? [e] : [
    e,
    { type: 'replan', step: 'fix-types', trigger: 'cap-halt', replan: 1, ts: '2026-08-04T10:03:00.000Z', seq: 2.1 },
    { type: 'replan', step: 'fix-types', trigger: 'step-variance', replan: 2, granted: 'converging', ts: '2026-08-04T10:04:00.000Z', seq: 2.2 },
  ]));
  const { code, out } = preview(['--resume', spineFile(withReplans)]);
  assert.equal(code, 0);
  assert.match(out, /replans  2 already spent by this run/, 'how many the CHAIN has spent, not how many this leg will get');
  assert.match(out, /arbiter's one extra is spent too/, 'and that the F85-C grant is gone — the two are different allowances');
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

test('§3 a STALL is a CHECKPOINT, not a fresh start — a step-stalled run resumes instead of re-paying for the steps it finished', () => {
  // hamr's go (2026-08-13). `step-stalled` is the one terminal whose OWN escalation
  // says *"retry the run"* (src/planrun.js) while this runner answered "Start a fresh
  // run" — discarding exactly the finished-step spend the step-level resume doctrine
  // exists to keep. The NAME stays (src/run.js keys the F44 spend floor on that
  // outcome), so what changes is which terminals read as a checkpoint.
  //
  // The floor rides along: a stalled `job-end` carries `spendComplete:false` (an
  // abandoned call may already have been billed), so the fold must be quoted as a
  // FLOOR here. An unknown that heals by being inherited is F6 in a resume coat.
  const rounds = [BUDGET * 0.15, BUDGET * 0.10];
  const spent = sum(rounds);
  const stalled = haltedSpine({ outcome: 'step-stalled', rounds })
    .map((e) => (e.type === 'job-end' ? { ...e, spendComplete: false } : e));
  const { code, out } = preview(['--resume', spineFile(stalled)]);
  assert.equal(code, 0, 'a stall leaves the tree, the plan and the finished steps on disk — that is a checkpoint, not a verdict');
  assert.match(out, /RESUME, continuing a halted run/);
  assert.match(out, new RegExp(`≥\\$${usd(spent)} and .* before the halt — FOLDED IN`), 'the fold is quoted as the FLOOR the stalled terminal declared');
  assert.match(out, new RegExp(`left {5}\\$${usd(BUDGET - spent)} of \\$${rx(BUDGET)}`));
  assert.match(out, /at       the close and its fix loop/, 'and it re-enters at the checkpoint, so none of the finished steps is re-paid');
});

test('§3 the refusal names the resumable set from the ONE constant, and every terminal it names really resumes', () => {
  // A terminal admitted in code but missing from the message (or the reverse) leaves
  // the operator reading a stale list to decide whether their run is recoverable. So
  // the list is read out of the runner's own constant rather than spelled twice here —
  // the same rule the money and wall numbers in this file follow.
  //
  // N4: that constant is now the LIBRARY's (`CHECKPOINT_OUTCOMES`, src/reuse.js). The
  // runner kept its own literal copy, and the exported bundle (PRD v1.44 §2 — a thin
  // runner with bareloop as a dependency) would have had to keep a third; the same
  // reasoning that put the pause TTL in the library puts this there. So what is pinned
  // here is that the script CONSUMES it rather than re-spelling it.
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /import \{[^}]*\bCHECKPOINT_OUTCOMES\b[^}]*\} from '\.\.\/src\/reuse\.js'/,
    'the runner reads the checkpoint set from the library that owns it');
  assert.doesNotMatch(src, /const RESUMABLE_HALTS = \[/,
    'and the literal copy is GONE, not merely shadowed — two spellings of one set is how a runner comes to refuse a terminal the library resumes');
  const halts = [...CHECKPOINT_OUTCOMES];
  assert.ok(halts.includes('step-stalled'), 'a stall is a checkpoint (hamr, 2026-08-13)');
  assert.ok(halts.includes('hitl-pause'), 'and so is a person who has not answered yet (N4 §1.6)');

  const refused = preview(['--resume', spineFile(haltedSpine({ outcome: 'escalated' }))]);
  assert.equal(refused.code, 2, 'an escalation is an answer, and answers are not resumable');
  assert.match(refused.out, new RegExp(rx(halts.join(' / '))), 'the refusal names exactly what the code admits');

  for (const h of halts) {
    const r = preview(['--resume', spineFile(haltedSpine({ outcome: h }))]);
    assert.equal(r.code, 0, `"${h}" is advertised as resumable, so it must actually resume — printed-but-refused is the worse half of the same drift`);
  }
});

test('§3 the STALL readout OFFERS the resume (source tripwire): the run that can be continued must say so where the operator is looking', () => {
  // Past the approval gate, so no preview can drive it — the same reason the other
  // end-of-run readouts in this file are pinned in source. The stall's own escalation
  // prints one line above it and says "retry the run"; without this block the only
  // retry on offer is a cold one that re-drafts the plan and re-pays every step.
  const src = readFileSync(RUNNER, 'utf8');
  const at = src.indexOf("if (outcome === 'step-stalled') {");
  assert.ok(at > 0, 'the stall readout exists');
  const end = src.indexOf('\n}', at);
  assert.ok(end > at, 'and it closes at its own indent');
  const block = src.slice(at, end);
  assert.match(block, /--resume \$\{runid\}/, 'it hands over the actual resume invocation, not the idea of one');
  assert.match(block, /--approve \$\{specHash\}/, 'with the hash ALREADY signed: no allowance moved, so nothing here needs re-signing');
  assert.doesNotMatch(block, /\bdie\(|process\.exit/, 'a readout never changes the run\'s own exit');
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

test('§F87 the signing preview names the close stages for a COMMAND close too — the goal and the thing that judges it are read at once, or not at all', () => {
  // The F87 gate exists so the signer reads BOTH halves on one screen. Gated on
  // `spec.closeDecl` it printed the stages for exactly one of the eleven shipped
  // specs; every command `close[]` spec — which is all the rest — showed a goal, a
  // hash, and nothing about what would judge it. That is the F87 half-reading,
  // reproduced by the block written to end it, so this drives the REAL preview
  // rather than reading the source: the defect was in what an operator SEES.
  //
  // Every expectation is DERIVED from the live spec (same rule as the money and wall
  // numbers above): a close edit moves the stage list, and this must move with it
  // instead of pinning a list the operator has since changed.
  const names = SPEC.close.map((s) => s.name);
  assert.ok(Array.isArray(SPEC.close) && names.length > 1 && !SPEC.closeDecl,
    'the fixture spec really is a multi-stage COMMAND close — the form the gate used to skip');
  const { code, out } = preview([]);
  assert.equal(code, 0, 'a preview is still a readout, not a refusal');
  assert.match(out, new RegExp(`judged   ${names.length} close stage\\(s\\)`), 'the COUNT, so a stage that never renders is visible as a gap');
  for (const n of names) {
    assert.match(out, new RegExp(`\\n {11}${rx(n)} {2}\\[command\\]`), `the close stage "${n}" is named to the signer`);
  }
  assert.doesNotMatch(out, /\[undefined\]/, 'a command stage carries no `kind`, and the readout says `command` rather than printing the absence');
  // ABOVE the hash, because the hash line is where the eye stops: the block is the
  // second half of the goal, not a footnote under the signature.
  assert.ok(out.indexOf('judged   ') < out.indexOf('  hash     '), 'the stages are read before the thing being signed, not after');

  // CONTROL: the DECLARED form still renders its own catalogue kinds, unchanged — the
  // two spec forms are one readout now, and `command` is not laundered over a real kind.
  const declSpec = JSON.parse(readFileSync(new URL('../jobs/pulselog-author-types.json', import.meta.url), 'utf8'));
  const decl = preview([], 'pulselog-author-types');
  assert.equal(decl.code, 0);
  assert.match(decl.out, new RegExp(`judged   ${declSpec.closeDecl.stages.length} close stage\\(s\\)`));
  for (const s of declSpec.closeDecl.stages) {
    assert.match(decl.out, new RegExp(`\\n {11}${rx(s.name)} {2}\\[${rx(s.kind)}\\]`), `the declared stage "${s.name}" keeps its authored kind`);
  }
  assert.doesNotMatch(decl.out, /\[command\]/, 'a declaration never falls back to the command spelling — its stages all carry a kind');
});

test('§3 ORDERING (source tripwire): the resume read and the approval gate both sit ABOVE the patient reset', () => {
  // A preview must never touch a patient. That is guaranteed by ORDER, so the order
  // is what is pinned: if a future edit moves the reset up, every test in this file
  // starts hard-resetting an operator's real repository instead of failing.
  const src = readFileSync(RUNNER, 'utf8');
  const readAt = src.indexOf('readResume(deadEvents');
  const gateAt = src.indexOf("if (arg('approve') !== specHash)");
  // the reset MECHANISM moved into scripts/u-patient.mjs (2026-08-19) so the read-shim
  // battery rehearses the same cold reset; the ORDERING property this tripwire guards
  // is unchanged, so the anchor follows the call site rather than the deleted literal.
  const resetAt = src.indexOf('coldReset(wd, SEED)');
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
  // close precheck's worth of nothing. The overspend is the scenario, so it is what the
  // fixture pins — two rounds that eat the SIGNED budget (whatever it is today; it was
  // $8 under the 2026-08-04 "go 8/45" top-up) and tip $0.13 past it.
  const OVER = 0.13;
  const rounds = [BUDGET * 0.625, BUDGET * 0.375 + OVER];
  const overBy = sum(rounds) - BUDGET;
  assert.equal(overBy.toFixed(4), '0.1300', 'the fixture really is the u-msew1uy5 shape: over by $0.13, at whatever budget is signed');
  const { code, out } = preview(['--resume', spineFile(haltedSpine({ rounds }))]);
  assert.equal(code, 0);
  assert.match(out, /NOTHING LEFT/);
  assert.match(out, new RegExp(`budgetUsd \\$${rx(BUDGET)} is already spent \\(over by \\$${usd(overBy)}\\)`));
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
 * death-minus-start, so this is the only way to drive the wall arm.
 * Its one round costs an eighth of the SIGNED budget: the wall arm has to fire with the
 * money arm silent, and "cheap" is only cheap relative to the allowance in force. */
const longSpine = (minutes) => {
  const t = (/** @type {number} */ m) => new Date(Date.parse('2026-08-04T10:00:00.000Z') + m * 60_000).toISOString();
  const cost = BUDGET / 8;
  return [
    { type: 'job-start', job: SPEC.job, specHash: 'old-hash-0000', budgetUsd: SPEC.budgetUsd, shape: 'plan', goal: SPEC.goal, ts: t(0), seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: cost, ts: t(2), seq: 3 },
    { type: 'step-end', step: 'fix-types', outcome: 'green', ts: t(minutes - 1), seq: 20 },
    { type: 'job-end', outcome: 'wall-halt', spentUsd: cost, spendComplete: true, ts: t(minutes), seq: 41 },
  ];
};
/** past the signed wall by a clear margin / comfortably inside it — both derived, so the
 * two arms stay on opposite sides of whatever clock the operator has signed */
const BURNT_MIN = WALL_MIN + 5;
const SOME_LEFT_MIN = WALL_MIN * 0.45;

test('§3 the WALL arm of the exhausted-allowance warning fires on its own, on the time axis', () => {
  const { code, out } = preview(['--resume', spineFile(longSpine(BURNT_MIN))]);
  assert.equal(code, 0);
  assert.match(out, /NOTHING LEFT/);
  assert.match(out, new RegExp(`maxWallMs ${rx(WALL_MIN)}min is already burnt`), 'the TIME lever, named on its own — the money is untouched here');
  assert.doesNotMatch(out, /budgetUsd .* is already spent/, 'and the money arm does not fire: an eighth of the signed budget is not the problem');
});

test('§3 a resume with NO WALL LEFT is REFUSED at launch, before the key and before the patient', () => {
  // Driven with the REAL signature, which is what makes this the launch path and not
  // another preview: past the gate the runner must stop on its own wall rather than
  // buy a scout and a precheck for a clock that has already run out. The key is empty
  // in this environment, so a runner that did NOT refuse would fall through to the
  // API-key check — a different exit-2 with a different message, which is exactly what
  // the second assertion separates.
  const { code, out } = preview(['--resume', spineFile(longSpine(BURNT_MIN)), '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 2, 'an operator-owned stop, on this file\'s convention (0 preview / 2 operator error)');
  assert.match(out, /WALL ALREADY EXHAUSTED/);
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY not set/, 'it stops ABOVE the key read — nothing about this needs a secret');
  assert.match(out, /RAISE maxWallMs/, 'and it names the lever, which is a spec edit and therefore a new signature');
});

test('§3 CONTROL: a resume with wall left is NOT refused — it goes on to the ordinary launch path', () => {
  // The should-differ half. Same signature, same code path, one changed number: under
  // half the signed wall is burnt, so the majority of it is still there, and the runner
  // must walk straight past the wall refusal into the key check it always did.
  const { code, out } = preview(['--resume', spineFile(longSpine(SOME_LEFT_MIN)), '--approve', jobSpecHash(SPEC)]);
  assert.equal(code, 2);
  assert.doesNotMatch(out, /WALL ALREADY EXHAUSTED/);
  assert.match(out, /ANTHROPIC_API_KEY not set/, 'the next gate down is where a healthy resume lands');
});

test('§3 CONTROL: a resume with allowance still on the table does NOT cry wolf', () => {
  // the should-differ half of the warning above: one cheap round against the SIGNED
  // budget, so seven eighths of it are still there to spend
  const rounds = [BUDGET / 8];
  const spent = sum(rounds);
  const { out } = preview(['--resume', spineFile(haltedSpine({ rounds }))]);
  assert.doesNotMatch(out, /NOTHING LEFT/);
  assert.match(out, new RegExp(`left {5}\\$${usd(BUDGET - spent)} of \\$${rx(BUDGET)}`));
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

// ── F97 — the DOOMED RESUME banner ──────────────────────────────────────────
//
// u-msn0uccv spent $0.82 re-entering the exact plan that WAS the diagnosed defect,
// with `priorReplans: 2` and `priorReplanGrantUsed: true` on its own `job-start` —
// the one channel that could have replaced the impossible action was spent before
// the leg opened. Nothing in the library was at fault; the DECISION to fire was, and
// the read that would have refused it is $0 and sits in the spine the preview gate
// already parses.
//
// So the predicate lives here, beside `wallLine`, for `wallLine`'s reason: the script
// runs on import, and a banner nothing can drive is a banner nothing can prove fires.
// It is a WARNING only — it never blocks and never changes what the run does.
import { doomedResume } from '../scripts/u-readout.mjs';

/** the restart fold as `readResume` hands it to the banner, F97's own numbers */
const F97 = { seed: { phase: 'steps' }, replans: 2, replanGrantUsed: true };

test('§F97 predicate: re-entering the reloaded PLAN with the replan ceiling spent is the doomed shape', () => {
  assert.equal(doomedResume(F97), true,
    'phase "steps" reloads the accepted plan verbatim (scout-skipped {reason:"resumed"}), and with both the ceiling and the arbiter\'s extra spent nothing can redraw it');
  assert.equal(doomedResume({ ...F97, replans: 1 }), true,
    'the ceiling is ONE replan plus the arbiter\'s one extra — at 1 + grantUsed the ledger is just as empty as at 2');
});

test('§F97 predicate CONTROL: a checkpoint at the CLOSE is not the doomed shape — every step finished and the fix loop is a different channel', () => {
  assert.equal(doomedResume({ ...F97, seed: { phase: 'close' } }), false,
    'nothing is re-entering a failed plan: the plan completed, and the outer close fix loop writes without a replan');
});

test('§F97 predicate CONTROL: with replan capacity LEFT the leg can redraw the plan, so no banner', () => {
  assert.equal(doomedResume({ ...F97, replans: 0, replanGrantUsed: false }), false,
    'a cold-ish resume has its whole ceiling');
  assert.equal(doomedResume({ ...F97, replans: 2, replanGrantUsed: false }), false,
    'the arbiter\'s one extra is still unearned — conditional capacity is capacity, and claiming zero here would be the banner crying wolf on the commonest resume there is');
});

test('§F97 predicate CONTROL: no plan checkpoint at all is the cold path — nothing is being re-entered', () => {
  assert.equal(doomedResume({ seed: null, replans: 2, replanGrantUsed: true }), false,
    'it halted before a plan was accepted, so the resume re-drafts and the ceiling is not what bounds it');
  assert.equal(doomedResume({ replans: 2, replanGrantUsed: true }), false, 'an absent seed reads as no checkpoint');
  assert.equal(doomedResume(null), false, 'and no restart at all is a cold launch');
});

test('§F97 predicate: a garbage ledger never SUPPRESSES the warning by reading as unspent — and never invents one either', () => {
  // the fail-safe direction: this drives a WARNING, so an unreadable ledger must not
  // silently mint "you have capacity". It also must not fire on a shape with no plan.
  for (const bad of [NaN, Infinity, null, undefined, '2', -1]) {
    assert.equal(doomedResume({ seed: { phase: 'steps' }, replans: /** @type {any} */ (bad), replanGrantUsed: true }), false,
      `an unreadable replan count (${String(bad)}) is not evidence of an EXHAUSTED ceiling — the banner states a fact or stays silent`);
  }
  assert.equal(doomedResume({ seed: { phase: /** @type {any} */ (null) }, replans: 2, replanGrantUsed: true }), false,
    'an unreadable phase is not a claim that a plan is being re-entered');
});

test('§F97 banner: the runner prints it through THIS predicate, and it WARNS rather than blocks', () => {
  const src = readFileSync(RUNNER, 'utf8');
  assert.match(src, /doomedResume\(/, 'the script drives the shared predicate rather than re-deriving the shape');
  // membership, not the exact list: the readout module has grown (N4's `deathAtOf`),
  // and pinning the spelling of the whole import made an unrelated addition a red
  assert.match(src, /import \{[^}]*\bdoomedResume\b[^}]*\} from '\.\/u-readout\.mjs'/, 'imported from the readout module the tests can reach');
  // WARNING ONLY: the F97 lesson is an operator pre-flight, not a new gate. A `die(`
  // or a `process.exit` reached from this predicate would turn a $0 read into a
  // refusal the operator never signed up for.
  // scoped to the BANNER BLOCK — not a byte-window, which would sweep in the approval
  // gate's own (correct, unrelated) `process.exit` two statements later and pass or
  // fail on how long the prose above it happens to be
  const at = src.indexOf('if (doomedResume(');
  assert.ok(at > 0, 'the banner is a guarded block, so there is a block to bound');
  const end = src.indexOf('\n    }', at);
  assert.ok(end > at, 'and it closes at its own indent');
  const block = src.slice(at, end);
  assert.doesNotMatch(block, /\bdie\(|process\.exit/, 'the banner never blocks the resume');
  assert.match(block, /console\.log/, 'it only prints');
});

test('§F97 banner E2E: the REAL preview prints it for F97\'s own spine shape, and stays silent on the control', () => {
  // Rendered through the script, because a predicate nothing drives is F50's class:
  // the operator's only sight of this read is the preview, and `doomedResume` returning
  // true in a unit test proves nothing about what the banner does on a spine.
  //
  // F97's shape, spelled in the two records that carry it: `job-start` DECLARES the
  // inherited replan ledger, and the window stops with the plan accepted and its step
  // unfinished (no `outer-close`) — which is `phase: 'steps'`, the re-entry that
  // reloads the plan verbatim.
  const doomed = haltedSpine().filter((e) => e.type !== 'step-end' && e.type !== 'outer-close')
    .map((e) => (e.type === 'job-start' ? { ...e, priorReplans: 2, priorReplanGrantUsed: true } : e));
  const { code, out } = preview(['--resume', spineFile(doomed)]);
  assert.equal(code, 0, 'a WARNING never changes the exit — the preview is still a readout');
  assert.match(out, /at       step 1 of 1/, 'the fixture really is the steps re-entry (guard against warning on the wrong shape)');
  assert.match(out, /⚠ SAME PLAN, NO REPLANS/);
  assert.match(out, /F97 paid \$0\.82/, 'the lesson is cited so the operator can go read what it bought');
  assert.doesNotMatch(out, /NOTHING LEFT/, 'and this is the OTHER warning: the allowance is fine, the shape is not');

  // CONTROL: same ledger, same everything — but the checkpoint is at the close, where
  // no failed plan is being re-entered. Two should-differ conditions, and the only
  // difference between them is the phase.
  const atClose = haltedSpine().map((e) => (e.type === 'job-start' ? { ...e, priorReplans: 2, priorReplanGrantUsed: true } : e));
  const ctl = preview(['--resume', spineFile(atClose)]);
  assert.equal(ctl.code, 0);
  assert.match(ctl.out, /at       the close and its fix loop/);
  assert.match(ctl.out, /replans  2 already spent/, 'the ledger line still prints — that one is not the warning');
  assert.doesNotMatch(ctl.out, /SAME PLAN, NO REPLANS/, 'no banner: the plan finished, and the close fix loop writes without a replan');
});
