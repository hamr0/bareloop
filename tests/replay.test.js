// replayRun/formatReplay exit criteria (PRD build-list #6): a report-only
// reconstruction of a run from its own spine + gate-audit — reads only,
// mints no verdict, writes nothing. Every assertion below reads a specific
// value straight off the REAL archived files (no authored fixtures) except
// the two defensive cases the brief allows constructing: a malformed line
// (via the CLI script, on a corrupted COPY of a real file) and a deleted
// `spentUsd` field (spliced out of a real record).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { replayRun, formatReplay } from '../src/replay.js';

const ARCHIVE = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u-bareloop';
const AURORA_SOAR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar-bareloop';
const LITECTX_TYPES = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types-bareloop';
const MAILPROOF_JOB2 = '/home/hamr/PycharmProjects/bareloop-patients/mailproof-job2-bareloop';
const BAREAGENT_U = '/home/hamr/PycharmProjects/bareloop-patients/bareagent-u-bareloop';
const LITECTX_MAINTAINER = '/home/hamr/PycharmProjects/bareloop-patients/litectx-maintainer-bareloop';
const SCRIPT = new URL('../scripts/run-replay.mjs', import.meta.url).pathname;

/** @param {string} file */
function parseJsonl(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** @param {string} id */
function loadRun(id) {
  const spine = parseJsonl(join(ARCHIVE, `u-${id}.jsonl`));
  const auditPath = join(ARCHIVE, `u-${id}-gate-audit.jsonl`);
  const audit = existsSync(auditPath) ? parseJsonl(auditPath) : [];
  return { spine, audit };
}

/** @type {string[]} */
const tmpDirs = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

const haveArchive = existsSync(ARCHIVE);

test('a GREEN run (u-ms2c0ls7) reconstructs job, spend, steps and ending', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const { spine, audit } = loadRun('ms2c0ls7');
  const s = replayRun(spine, audit, { runId: 'ms2c0ls7' });
  assert.equal(s.runId, 'ms2c0ls7');
  assert.equal(s.job, 'aurora-u-spawner-types');
  assert.equal(s.outcome, 'green');
  assert.equal(s.stopReason, null, 'a green run has nothing to explain');
  assert.equal(s.spentUsd, 2.2072228);
  assert.equal(s.spendComplete, true);
  assert.equal(s.wallMs, 536431, 'wallMs is job-end.ts minus job-start.ts, both real timestamps');
  assert.equal(s.steps.length, 3);
  assert.deepEqual(s.steps.map((st) => st.id), ['annotate-init-methods', 'fix-remaining-strict-violations', 'verify-tests-still-pass']);
  for (const st of s.steps) {
    assert.equal(st.outcome, 'green');
    assert.ok(st.rounds > 0, `${st.id}: a real step spends at least one worker-round`);
  }
  assert.equal(s.skipped, 0);
  assert.ok(s.ending.record, 'the last spine record is carried');
  assert.equal(s.ending.record.type, 'job-end');
  assert.equal(s.ending.before.length, 3);

  // wall-clock fallback (F117 fix #1): its elapsedMs is a START-of-engagement
  // snapshot (chain time inherited at the top of this run, not this run's own
  // duration) — asserting on the real record's own fields, never hardcoded.
  const wallClockRecord = spine.find((e) => e.type === 'wall-clock');
  assert.ok(wallClockRecord, 'precondition: the real file carries a wall-clock record');
  assert.equal(wallClockRecord.elapsedMs, 0, 'precondition: this real record\'s elapsedMs really is exactly 0 — the case that used to print as "0.0s of 30m00s signed" and read as a zero-second run');
  assert.equal(wallClockRecord.requestedMs, 1800000, 'precondition: a 30-minute signed wall');
  assert.ok(s.chainClock, 'a wall-clock record yields a chainClock reading when there is no wall-halt');
  assert.equal(s.chainClock.source, 'wall-clock');
  assert.equal(s.chainClock.elapsedMs, wallClockRecord.elapsedMs);
  assert.equal(s.chainClock.requestedMs, wallClockRecord.requestedMs);

  const text = formatReplay(s);
  assert.match(text, /RUN ms2c0ls7/);
  assert.match(text, /outcome: green/);
  // the wall-clock fallback must NEVER read as "this run took 0 seconds" — it
  // must name what the number actually is (inherited at start) and say plainly
  // there is no end-of-run chain reading in this file.
  assert.match(text, /clock: 30m00s signed · 0\.0s inherited from prior legs at start \(from wall-clock; no end-of-run reading in this file\)/);
  assert.doesNotMatch(text, /clock: 0\.0s of 30m00s signed/, 'the old wording (reads as "took 0 seconds") must be gone');
  assert.match(text, /\$2\.2072/);
  assert.match(text, /ENDING/);
  assert.match(text, /BEHAVIOUR/);
});

test('a PROVIDER-RED run (u-mszcthk1) carries a floor spend and a named stop reason', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const { spine, audit } = loadRun('mszcthk1');
  const s = replayRun(spine, audit, { runId: 'mszcthk1' });
  assert.equal(s.outcome, 'provider-red');
  assert.equal(s.spentUsd, 0.8529209000000001);
  assert.equal(s.spendComplete, false, 'F44/F6: an unpriced-transport-failure spend is a floor, never exact');
  assert.match(String(s.stopReason), /provider path failed mid-run/);
  // the ACTUAL reason this run died (the escalation's own `detail`, src/planrun.js:2427)
  // must ride onto stopReason verbatim — the generic per-category decision prose alone
  // ("the provider path failed mid-run…") fires for every transport casualty and hides
  // exactly the information a 5-minute replay exists to surface.
  assert.match(String(s.stopReason), /bad record mac/);
  assert.equal(s.steps.length, 1);
  assert.equal(s.steps[0].id, 'fix-spawner-mypy-strict');
  assert.equal(s.steps[0].outcome, 'escalated');

  // this run's own escalation (seq 77) sits 4 records before job-end (seq 81) —
  // outside the fixed 3-before ENDING window — so it must ride as its own field
  // rather than being silently dropped from the reconstructed ending.
  assert.ok(s.ending.escalation, 'the last escalation is carried even when outside the 3-before window');
  assert.equal(s.ending.escalation.seq, 77);
  assert.match(String(s.ending.escalation.detail), /bad record mac/);
  assert.ok(!s.ending.before.some((r) => r.seq === 77), 'precondition: seq 77 really is outside the 3-before window');

  const text = formatReplay(s);
  assert.match(text, /bad record mac/, 'the formatted report surfaces the real failure, not just the generic category prose');
});

test('an ESCALATED (cap-halt) run (u-mszeikq6) states the strike-out reason and per-step checks', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const { spine, audit } = loadRun('mszeikq6');
  const s = replayRun(spine, audit, { runId: 'mszeikq6' });
  assert.equal(s.outcome, 'escalated');
  assert.equal(s.spentUsd, 2.684313800000001);
  assert.match(String(s.stopReason), /strikes — the fix loop stopped making progress/);
  assert.equal(s.steps.length, 1);
  const step = s.steps[0];
  assert.equal(step.id, 'fix-mypy-strict-spawner');
  assert.equal(step.outcome, 'green', 'the STEP itself closed green; the run-level escalation is a separate ladder outside it');
  assert.ok(step.checks.passed >= 1 && step.checks.failed >= 1, 'the real archived fix loop recorded both a red and a green check-passes iteration');
  assert.equal(step.treeChanged, true);
  assert.ok(step.toolCalls > 0, 'gate-audit rows fall inside the step-start..step-end window');
});

test('--all lists every archived run: id, outcome, spend, stop reason', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, '--all', ARCHIVE], { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  const files = readdirSync(ARCHIVE).filter((f) => /^u-[^/]+\.jsonl$/.test(f) && !f.includes('gate-audit') && !f.endsWith('.lag.jsonl'));
  assert.equal(lines.length, files.length, 'one line per real spine file, none dropped or duplicated');
  const line = lines.find((l) => l.startsWith('mszcthk1 '));
  assert.ok(line, 'the known provider-red run appears in the listing');
  assert.match(line, /provider-red/);
  assert.match(line, /\$0\.8529/);
});

test('the CLI resolves the sibling gate-audit and prints a full report for a real run', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, join(ARCHIVE, 'u-mszcthk1.jsonl')], { encoding: 'utf8' });
  assert.match(out, /RUN mszcthk1/);
  assert.match(out, /outcome: provider-red/);
  assert.match(out, /provider path failed mid-run/);
});

test('a malformed line is counted and never thrown — CLI stays green over a corrupted copy', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-replay-test-'));
  tmpDirs.push(dir);
  const srcSpine = join(ARCHIVE, 'u-mszcthk1.jsonl');
  const dstSpine = join(dir, 'u-mszcthk1.jsonl');
  copyFileSync(srcSpine, dstSpine);
  appendFileSync(dstSpine, 'this is not valid json\n');
  const srcAudit = join(ARCHIVE, 'u-mszcthk1-gate-audit.jsonl');
  if (existsSync(srcAudit)) copyFileSync(srcAudit, join(dir, 'u-mszcthk1-gate-audit.jsonl'));

  const out = execFileSync('node', [SCRIPT, dstSpine], { encoding: 'utf8' });
  assert.match(out, /RUN mszcthk1/, 'the corrupted line does not stop the run from being reconstructed');
  assert.match(out, /1 malformed line skipped/);
});

test('spentUsd reads null (never 0) when a real job-end record has no spend field', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const { spine } = loadRun('ms2c0ls7');
  const jobEnd = spine.find((e) => e.type === 'job-end');
  assert.ok(jobEnd && typeof jobEnd.spentUsd === 'number', 'precondition: the real record has a spentUsd to delete');
  const { spentUsd, ...withoutSpend } = jobEnd;
  const strippedSpine = spine.map((e) => (e === jobEnd ? withoutSpend : e));
  const s = replayRun(strippedSpine, []);
  assert.equal(s.spentUsd, null, 'an absent spend field reads as unknown, never as $0 (F6)');
  assert.equal(s.spendComplete, false);
});

test('replayRun never throws on a non-object entry in either array, and counts it skipped', () => {
  const events = [
    { type: 'job-start', job: 'x' },
    null,
    'not an event',
    { type: 'job-end', outcome: 'green', spentUsd: 1, spendComplete: true },
  ];
  const audit = [{ action: { type: 'read', path: '/a', args: { tool: 'shell_read' } }, decision: 'allow' }, 42];
  const s = replayRun(events, audit);
  assert.equal(s.outcome, 'green');
  assert.equal(s.skipped, 3, 'two bad spine entries (null, a bare string) + one bad audit entry (a number)');
});

// ── name-agnostic discovery (coordinator fix, 2026-08-25) ──────────────────
// The patient corpus does not agree on a filename convention — battery/
// screen/probe/reuse spines all use their own prefix. `--all` must find a
// spine by CONTENT (a `job-start` or `run-start` record somewhere in the
// file), never by matching `u-*.jsonl`, and must name — never silently
// drop — a `.jsonl` that is neither a spine nor a recognised sidecar.

test('--all on aurora-soar (battery/l2accept/l2clip prefixes) finds spines never matching u-*.jsonl', { skip: !existsSync(AURORA_SOAR) && 'no aurora-soar patient on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, '--all', AURORA_SOAR], { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  assert.ok(lines.length > 0);
  assert.ok(lines.some((l) => l.startsWith('battery-A1-')), 'a battery-prefixed spine is found');
  assert.ok(lines.some((l) => l.startsWith('l2accept-L1-') || l.startsWith('l2clip-L1-')), 'an l2accept/l2clip-prefixed spine is found');
  assert.ok(!lines.some((l) => /^u-/.test(l)), 'this patient carries no u-*.jsonl runs at all — the old name filter would have found zero');
  for (const l of lines) assert.doesNotMatch(l, /^undefined|^null/, `no line reads as a broken/undefined summary: "${l}"`);
});

test('--all on mailproof-job2 flags its own orphan gate-audit file as not-a-spine, never silently', { skip: !existsSync(MAILPROOF_JOB2) && 'no mailproof-job2 patient on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, '--all', MAILPROOF_JOB2], { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  const orphanLine = lines.find((l) => l.startsWith('battery-mrm7gk25-orphan-gate-audit-mrm7gk27.jsonl'));
  assert.ok(orphanLine, 'the orphan file (named like a sidecar but not ending in -gate-audit.jsonl) is listed, not dropped');
  assert.match(orphanLine, /not-a-spine/);
  assert.ok(lines.some((l) => l.startsWith('battery-P1-mrm8dr1l')), 'a real battery-prefixed spine in the same dir is still found');
});

test('--all on litectx-types flags real non-spine .jsonl logs as not-a-spine', { skip: !existsSync(LITECTX_TYPES) && 'no litectx-types patient on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, '--all', LITECTX_TYPES], { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  // types-check-log.jsonl / types-close-log.jsonl: bare {ts, check, ...} rows,
  // no `type` field at all — neither job-start nor run-start ever appears.
  assert.ok(lines.includes('types-check-log.jsonl  not-a-spine'));
  assert.ok(lines.includes('types-close-log.jsonl  not-a-spine'));
  assert.ok(lines.some((l) => l.startsWith('types-screen-C-')), 'the real screen-C spines in the same dir are still found');
});

test('a directory with no .jsonl files at all says so, not a blank line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-replay-empty-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'notes.txt'), 'nothing here');
  const out = execFileSync('node', [SCRIPT, '--all', dir], { encoding: 'utf8' });
  assert.match(out, /no \.jsonl files found/);
});

test('looksLikeSpine (via the CLI, on a hand-built non-spine .jsonl) is reported, not silently skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-replay-notaspine-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'weird-log.jsonl'), '{"ts":"2026-01-01T00:00:00.000Z","check":"x","pass":true}\n');
  const out = execFileSync('node', [SCRIPT, '--all', dir], { encoding: 'utf8' });
  assert.equal(out.trim(), 'weird-log.jsonl  not-a-spine');
});

// ── occurrence attribution + wall/clock labeling (coordinator fix, 2026-08-25) ──

test('a step that RUNS TWICE (u-msdsmkid, fix-loop-strict) is split by occurrence, never merged by id', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const spinePath = join(BAREAGENT_U, 'u-msdsmkid.jsonl');
  const spine = parseJsonl(spinePath);
  const auditPath = join(BAREAGENT_U, 'u-msdsmkid-gate-audit.jsonl');
  const audit = existsSync(auditPath) ? parseJsonl(auditPath) : [];

  // derive the expected total from the file itself — never hardcode
  const totalRoundsForId = spine.filter((e) => e.type === 'worker-round' && e.phase === 'step:fix-loop-strict').length;
  assert.ok(totalRoundsForId > 0, 'precondition: the real file has worker-rounds for this id');

  const s = replayRun(spine, audit, { runId: 'msdsmkid' });
  const occurrences = s.steps.filter((st) => st.id === 'fix-loop-strict');
  assert.equal(occurrences.length, 2, 'two step-start/step-end pairs for the same id are two occurrences, not one merged row');
  assert.deepEqual(occurrences.map((o) => o.occurrence), [1, 2]);
  assert.notEqual(occurrences[0].rounds, occurrences[1].rounds, 'the two occurrences must have DIFFERENT round tallies (the bug: both showed 82)');
  const sum = occurrences[0].rounds + occurrences[1].rounds;
  assert.equal(sum, totalRoundsForId, "the two occurrences partition the id's real worker-rounds exactly, none lost, none double-counted");
  assert.equal(occurrences[0].outcome, 'escalated');
  assert.equal(occurrences[1].outcome, 'green');
  assert.notEqual(occurrences[0].checks.failed, undefined);

  const text = formatReplay(s);
  const lines = text.split('\n').filter((l) => l.trim().startsWith('fix-loop-strict'));
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[0], /\(2nd\)/, 'the FIRST occurrence prints unmarked');
  assert.match(lines[1], /fix-loop-strict \(2nd\)/, 'the repeated occurrence prints an ordinal marker');
});

test('u-msx87qqs labels "this file" wall vs the chain-scoped signed clock separately', { skip: !existsSync(LITECTX_MAINTAINER) && 'no litectx-maintainer patient on this machine' }, () => {
  const spinePath = join(LITECTX_MAINTAINER, 'u-msx87qqs.jsonl');
  const spine = parseJsonl(spinePath);
  const auditPath = join(LITECTX_MAINTAINER, 'u-msx87qqs-gate-audit.jsonl');
  const audit = existsSync(auditPath) ? parseJsonl(auditPath) : [];

  const jobStart = spine.find((e) => e.type === 'job-start');
  const jobEnd = spine.findLast((e) => e.type === 'job-end');
  const wallHalt = spine.findLast((e) => e.type === 'wall-halt');
  assert.ok(jobStart && jobEnd && wallHalt, 'precondition: the real file carries job-start, job-end and wall-halt');

  const s = replayRun(spine, audit, { runId: 'msx87qqs' });
  assert.equal(s.wallMs, Date.parse(jobEnd.ts) - Date.parse(jobStart.ts), "wallMs is THIS FILE's own job-start..job-end span");
  assert.ok(s.chainClock, 'a wall-halt record yields a chainClock reading');
  assert.equal(s.chainClock.source, 'wall-halt');
  assert.equal(s.chainClock.elapsedMs, wallHalt.elapsedMs);
  assert.equal(s.chainClock.requestedMs, wallHalt.requestedMs);
  // the two numbers really do diverge on this real file — the exact ambiguity being fixed
  assert.notEqual(Math.round(s.wallMs), Math.round(s.chainClock.elapsedMs));

  const text = formatReplay(s);
  assert.match(text, /wall: .+\(this file, job-start→job-end\)/);
  assert.match(text, /clock: .+ of .+ signed \(chain, from wall-halt\)/);
});
