// replayRun/formatReplay exit criteria (PRD build-list #6): a report-only
// reconstruction of a run from its own spine + gate-audit — reads only,
// mints no verdict, writes nothing. Every assertion below reads a specific
// value straight off the REAL archived files (no authored fixtures) except
// the two defensive cases the brief allows constructing: a malformed line
// (via the CLI script, on a corrupted COPY of a real file) and a deleted
// `spentUsd` field (spliced out of a real record).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { replayRun, formatReplay, summarizeForAllLine, formatAllLines } from '../src/replay.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

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
  assert.match(text, /RUN ms2c0ls7 · aurora-u-spawner-types/);
  assert.match(text, /outcome: green/);
  // the wall-clock fallback must NEVER read as "this run took 0 seconds" — it
  // must name what the number actually is (inherited at start) and say plainly
  // there is no end-of-run chain reading in this file.
  assert.match(text, /clock: 30m00s signed · 0\.0s inherited from prior legs at start \(from wall-clock; no end-of-run reading in this file\)/);
  assert.doesNotMatch(text, /clock: 0\.0s of 30m00s signed/, 'the old wording (reads as "took 0 seconds") must be gone');
  assert.match(text, /\$2\.2072/);
  assert.match(text, /TIMELINE \(steps\)/);
  assert.match(text, /CLOSE\n {2}satisfied · 4 stages: changed-from-seed OK · typecheck OK · suite-green OK · no-suppressions OK/, 'the outer-close (the only close on a never-replanned green run) is the CLOSE section');
  assert.match(text, /ENDING/);
  assert.match(text, /BEHAVIOUR/);
  assert.match(text, /MEMORY-CACHE  not armed on this run/, 'MEMORY-CACHE is ALWAYS printed, even absent');
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

  // this run never reached a close at all (no close-verdict, no outer-close) —
  // verified directly on the real file, not inferred from the outcome.
  assert.equal(spine.filter((e) => e.type === 'close-verdict').length, 0, 'precondition: no close-verdict anywhere in this file');
  assert.equal(spine.filter((e) => e.type === 'outer-close').length, 0, 'precondition: no outer-close anywhere in this file');
  assert.equal(s.close, null);

  const text = formatReplay(s);
  assert.match(text, /bad record mac/, 'the formatted report surfaces the real failure, not just the generic category prose');
  assert.match(text, /CLOSE\n {2}none — the run ended before any close ran/, 'the CLOSE section is never omitted, even when no close ever ran');
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

  // CLOSE section: the FIX LOOP'S OWN final close-verdict (the run's real
  // close never satisfied — that's WHY it escalated), never the earlier
  // outer-close precheck that happened before the fix loop even started.
  const closeVerdicts = spine.filter((e) => e.type === 'close-verdict' && Array.isArray(e.stages));
  const outerCloses = spine.filter((e) => e.type === 'outer-close');
  assert.ok(closeVerdicts.length > 0 && outerCloses.length > 0, 'precondition: this file has BOTH a precheck outer-close and fix-loop close-verdicts');
  const lastByType = [...outerCloses, ...closeVerdicts].sort((a, b) => a.seq - b.seq);
  const expected = lastByType[lastByType.length - 1];
  assert.equal(expected.type, 'close-verdict', 'precondition: the fix loop\'s own close-verdict is LATER (by seq) than the precheck outer-close');
  assert.equal(s.close.source, 'close-verdict');
  assert.equal(s.close.iteration, expected.iteration);
  assert.equal(s.close.verdict, expected.verdict);
  assert.equal(s.close.verdict, 'needs_revision', 'the fix loop never got this close to satisfied — consistent with the run escalating');
});

test('--all lists every archived run with a header row: id, job, shape, outcome, spend, wall, steps, reason', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, '--all', ARCHIVE], { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  const files = readdirSync(ARCHIVE).filter((f) => /^u-[^/]+\.jsonl$/.test(f) && !f.includes('gate-audit') && !f.endsWith('.lag.jsonl'));
  // header + one row per spine + (a footnote line IF this archive holds at
  // least one resumed run — measured, not assumed: aurora-u-bareloop does) +
  // (a second footnote line IF it holds at least one run with a transport
  // retry — F119: measured, u-mt8yk53k does).
  const hasFootnote = lines.some((l) => l.startsWith('* resumed run'));
  const hasRetryFootnote = lines.some((l) => l.startsWith('⟲N transport retry'));
  assert.equal(lines.length, files.length + 1 + (hasFootnote ? 1 : 0) + (hasRetryFootnote ? 1 : 0), 'one header row + one line per real spine file (+ the resumed/retry footnotes when any row needs them), none dropped or duplicated');
  assert.match(lines[0], /^id\s+job\s+shape\s+class\s+model\s+outcome\s+spend\s+wall\s+steps\s+reason$/, 'the header row names every column');
  const line = lines.find((l) => l.startsWith('mszcthk1 '));
  assert.ok(line, 'the known provider-red run appears in the listing');
  assert.match(line, /aurora-u-spawner-types/, 'the job column is present');
  assert.match(line, /\bplan\b/, 'the shape column is present');
  assert.match(line, /provider-red/);
  assert.match(line, /\$0\.8529/);

  // fixed columns, aligned — never CSV: every `$` in the spend column starts
  // at the SAME character offset across every data row (the header's own
  // "spend" label included in the width computation, per hamr's ruling).
  const dataLines = lines.slice(1);
  const dollarOffsets = new Set(dataLines.map((l) => l.indexOf('$')).filter((i) => i !== -1));
  assert.equal(dollarOffsets.size, 1, `every spend column must start at the same offset; saw offsets ${[...dollarOffsets]}`);
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
  // row text now leads with a row number ("1  fix-loop-strict …"), so match
  // on the row-number prefix rather than the id starting the line.
  const lines = text.split('\n').filter((l) => /^\s*\d+\s+fix-loop-strict/.test(l));
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
  assert.match(text, /wall .+\(this file\)/);
  assert.match(text, /clock: .+ of .+ signed \(chain, from wall-halt\)/);
});

// ── the signed layout: header block, per-row time/cost/tripped, CLOSE
// section, loop-shape iterations, and the job/shape --all columns
// (hamr, 2026-08-25) ─────────────────────────────────────────────────────

test('u-msdsmkid: header block, per-step wall/spend/tripped, replans via the materials fallback, CLOSE none', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const spinePath = join(BAREAGENT_U, 'u-msdsmkid.jsonl');
  const spine = parseJsonl(spinePath);
  const auditPath = join(BAREAGENT_U, 'u-msdsmkid-gate-audit.jsonl');
  const audit = existsSync(auditPath) ? parseJsonl(auditPath) : [];
  const jobStart = spine.find((e) => e.type === 'job-start');
  const jobEnd = spine.findLast((e) => e.type === 'job-end');

  // preconditions this test's expectations depend on — all read from the
  // real file, not asserted from memory
  assert.equal(spine.filter((e) => e.type === 'work-branch').length, 0, 'precondition: this archived run predates the work-branch rung');
  const planExecuted = spine.findLast((e) => e.type === 'plan-executed');
  assert.equal(typeof planExecuted.replans, 'undefined', 'precondition: this archived run predates plan-executed.replans');
  const replanMaterials = spine.filter((e) => e.type === 'materials' && e.phase === 'replan');
  assert.equal(replanMaterials.length, 1, 'precondition: exactly one real replan-phase materials record');

  const s = replayRun(spine, audit, { runId: 'msdsmkid' });
  assert.equal(s.job, jobStart.job);
  assert.equal(s.goal, jobStart.goal);
  assert.equal(s.budgetUsd, jobStart.budgetUsd);
  assert.equal(s.specHash, jobStart.specHash);
  assert.equal(s.branch, null, 'no work-branch record in this file — null, never a derived/guessed name');
  assert.equal(s.replans, 1, 'falls back to the materials phase:"replan" count when plan-executed.replans is absent');
  assert.equal(s.close, null, 'this run never reached a close at all');

  assert.equal(s.steps.length, 3);
  const [occ1, occ2, occ3] = s.steps;
  assert.equal(occ1.wallMs, Date.parse('2026-08-03T22:36:32.684Z') - Date.parse('2026-08-03T22:25:24.850Z'));
  assert.ok(occ1.spentUsd > 0 && occ1.unpricedRounds === 0);
  assert.ok(occ1.tripped && occ1.tripped.category === 'cap-halt');
  // this occurrence's escalation carries NO `detail` field at all (a
  // ladder-exhaustion cap-halt, src/ralph.js) — the tripped line must still
  // say something real by falling back to `decision`, never a bare category.
  const capHaltEsc = spine.find((e) => e.type === 'escalation' && e.category === 'cap-halt' && e.seq < 130);
  assert.equal(typeof capHaltEsc.detail, 'undefined', 'precondition: this escalation really has no detail field');
  assert.match(occ1.tripped.detail, /the step stopped making progress/);

  assert.equal(occ2.tripped, null, 'the SECOND (green) occurrence tripped nothing');
  assert.ok(occ3.tripped && occ3.tripped.category === 'step-variance');

  const text = formatReplay(s);
  assert.match(text, /RUN msdsmkid · bareagent-u-types/);
  assert.match(text, new RegExp(`goal: {4}${jobStart.goal.slice(0, 20)}`));
  assert.match(text, /shape: {3}plan · 3 steps, 1 replan/);
  assert.match(text, /signed: {2}\$4\.00 budget · 25m00s wall · spec 1c35a1eb/);
  assert.match(text, /branch: {2}none recorded/);
  assert.match(text, /resumed: no/, 'no priorSpentUsd on this real job-start — a genuinely cold run');
  assert.match(text, /spent: {3}\$3\.5428 of \$4\.00 signed · wall 25m43s \(this file\)/);
  assert.match(text, /TIMELINE \(steps\)/);
  assert.match(text, /#\s+step\s+result\s+rounds\s+tools\s+checks\s+tree\s+wall\s+spend/, 'the timeline carries its own column header row');
  assert.match(text, /fix-loop-strict \(2nd\)/);
  assert.match(text, /↳ tripped: cap-halt/);
  assert.match(text, /↳ tripped: step-variance/);
  assert.match(text, /CLOSE\n {2}none — the run ended before any close ran/);
  assert.match(text, /MEMORY-CACHE {2}not armed on this run/);
  assert.equal(s.spentUsd, jobEnd.spentUsd);
});

test('u-msf70nei: loop-shape iterations, and CLOSE resolves the LATER fix-loop close-verdict over the earlier outer-close precheck', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const spinePath = join(BAREAGENT_U, 'u-msf70nei.jsonl');
  const spine = parseJsonl(spinePath);
  const auditPath = join(BAREAGENT_U, 'u-msf70nei-gate-audit.jsonl');
  const audit = existsSync(auditPath) ? parseJsonl(auditPath) : [];

  // preconditions: the file carries an EARLIER outer-close (a precheck that
  // read red) and a LATER staged close-verdict (the fix loop's own final,
  // satisfied) — the exact shape that would mislead a type-preferring picker.
  const outerClose = spine.find((e) => e.type === 'outer-close');
  const finalCloseVerdict = spine.findLast((e) => e.type === 'close-verdict' && Array.isArray(e.stages));
  assert.ok(outerClose && finalCloseVerdict, 'precondition: both records exist in this real file');
  assert.equal(outerClose.verdict, 'needs_revision');
  assert.ok(outerClose.seq < finalCloseVerdict.seq, "precondition: the outer-close precheck is EARLIER than the fix loop's own close-verdict");
  assert.equal(finalCloseVerdict.verdict, 'satisfied');
  assert.equal(spine.filter((e) => e.type === 'step-start').length, 0, 'precondition: no step-start at all — this is the loop-shape case');

  const s = replayRun(spine, audit, { runId: 'msf70nei' });
  assert.equal(s.timelineKind, 'iterations');
  assert.equal(s.steps.length, 0);
  assert.equal(s.iterations.length, 2);
  assert.equal(s.outcome, 'green');

  // the CLOSE section must pick the LATER, real terminal verdict — never the
  // earlier precheck, even though the precheck was red and could be mistaken
  // for "the" answer by a picker that prefers `outer-close`'s type.
  assert.ok(s.close, 'a close was resolved');
  assert.equal(s.close.source, 'close-verdict');
  assert.equal(s.close.verdict, 'satisfied');
  assert.equal(s.close.iteration, finalCloseVerdict.iteration);
  assert.deepEqual(s.close.stages.map((st) => st.name), finalCloseVerdict.stages.map((st) => st.name));

  assert.equal(s.iterations[0].verdict, 'needs_revision');
  assert.equal(s.iterations[1].verdict, 'satisfied');
  assert.ok(s.iterations[0].closeStage && s.iterations[0].closeStage.verdict === 'needs_revision');

  const text = formatReplay(s);
  assert.match(text, /shape: {3}loop · 2 iterations/, 'loop-shape header uses the LOOP label, never the (always-\'plan\') job-start.shape field');
  assert.match(text, /TIMELINE \(iterations — loop-shape run\)/);
  assert.match(text, /#\s+iteration\s+result\s+rounds\s+tools\s+wall\s+spend/, 'iterations carry their own column header, no checks\\/tree columns');
  assert.match(text, /iteration 1.*RED/);
  assert.match(text, /iteration 2.*GREEN/);
  assert.match(text, /↳ close: needs_revision — typecheck/);
  assert.match(text, /↳ close: satisfied/);
  assert.match(text, /CLOSE\n {2}iteration 2 · satisfied · 4 stages: changed-from-seed OK · typecheck OK · suite-green OK · no-suppressions OK/);
});

test('--all on bareagent-u-bareloop: job/shape columns, "N it" for loop-shape, aligned columns', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const out = execFileSync('node', [SCRIPT, '--all', BAREAGENT_U], { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  assert.match(lines[0], /^id\s+job\s+shape\s+class\s+model\s+outcome\s+spend\s+wall\s+steps\s+reason$/);

  const msf70 = lines.find((l) => l.startsWith('msf70nei'));
  assert.ok(msf70);
  assert.match(msf70, /^msf70nei\*\s/, 'msf70nei is a REAL resumed run (job-start.priorSpentUsd) — its row carries the asterisk');
  assert.match(msf70, /\bloop\b/);
  assert.match(msf70, /\b2 it\b/, 'a loop-shape row shows its iteration count suffixed "it", never a bare number');
  assert.match(msf70, /-\s*$/, 'a green row\'s reason column is a bare dash');

  const msdsmkid = lines.find((l) => l.startsWith('msdsmkid'));
  assert.ok(msdsmkid);
  assert.doesNotMatch(msdsmkid, /^msdsmkid\*/, 'msdsmkid is a genuinely cold run — no asterisk');
  assert.match(msdsmkid, /\bplan\b/);
  assert.match(msdsmkid, /\b3\b/, 'a plan-shape row shows its bare step count, no "it" suffix');
  assert.match(msdsmkid, /step-variance/);

  assert.equal(lines.at(-1), '* resumed run — spend is the chain total, see detail', 'the footnote appears once, at the end, since this directory has resumed rows (msf70nei, mshzvkqw)');

  // fixed columns, aligned — the outcome column starts at the same offset
  // on every data row (id-column width varies less here, so check outcome
  // instead of spend for a second, independent alignment axis). The
  // footnote line is excluded — it is prose, not a table row.
  const dataLines = lines.slice(1, -1);
  const outcomeStarts = new Set(dataLines.map((l) => {
    const m = l.match(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+/); // id, job, shape, class, model
    return m ? m[0].length : -1;
  }));
  assert.equal(outcomeStarts.size, 1, `every outcome column must start at the same offset; saw ${[...outcomeStarts]}`);
});

// ── Spend on resumed runs: chain total vs this-file (hamr, 2026-08-25) ─────

test('u-msf70nei: chain total ($5.3389) and this-file spend ($1.2127, summed rounds) both trace to the real file', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const spinePath = join(BAREAGENT_U, 'u-msf70nei.jsonl');
  const spine = parseJsonl(spinePath);
  const auditPath = join(BAREAGENT_U, 'u-msf70nei-gate-audit.jsonl');
  const audit = existsSync(auditPath) ? parseJsonl(auditPath) : [];

  const jobEnd = spine.findLast((e) => e.type === 'job-end');
  const rounds = spine.filter((e) => e.type === 'worker-round');
  const summed = rounds.reduce((acc, r) => acc + r.costUsd, 0);
  assert.ok(rounds.every((r) => typeof r.costUsd === 'number'), 'precondition: every real round in this file is priced');
  assert.equal(typeof jobEnd.engagementSpentUsd, 'undefined', 'precondition: this archived run predates engagementSpentUsd — the summed-rounds fallback is what is under test');

  const s = replayRun(spine, audit, { runId: 'msf70nei' });
  assert.equal(s.resumed, true, 'job-start.priorSpentUsd is real on this file');
  assert.equal(s.spentUsd, jobEnd.spentUsd, 'the CHAIN total is job-end.spentUsd, unchanged');
  assert.equal(s.thisFileSpend.source, 'summed rounds');
  assert.ok(Math.abs(s.thisFileSpend.value - summed) < 1e-9, "thisFileSpend sums THIS FILE's own worker-round.costUsd exactly");
  assert.equal(s.thisFileSpend.totalRounds, rounds.length);
  assert.equal(s.thisFileSpend.unpricedRounds, 0);
  // the two numbers really do diverge — that IS the finding this fixes
  assert.ok(Math.abs(s.spentUsd - s.thisFileSpend.value) > 1, 'chain total and this-file spend are NOT the same claim on a resumed run');

  const text = formatReplay(s);
  assert.match(text, new RegExp(`\\$${jobEnd.spentUsd.toFixed(4)} chain total \\(job-end; prior legs folded\\)`));
  assert.match(text, new RegExp(`this file \\$${summed.toFixed(4)} \\(${rounds.length} rounds, all priced; summed rounds\\)`));
});

test('u-msx87qqs (litectx-maintainer) reads resumed: yes from job-start.priorSpentUsd even with NO resume-seed record', { skip: !existsSync(LITECTX_MAINTAINER) && 'no litectx-maintainer patient on this machine' }, () => {
  const spinePath = join(LITECTX_MAINTAINER, 'u-msx87qqs.jsonl');
  const spine = parseJsonl(spinePath);
  assert.equal(spine.filter((e) => e.type === 'resume-seed').length, 0, 'precondition: genuinely no resume-seed record in this real file');
  const jobStart = spine.find((e) => e.type === 'job-start');
  assert.ok(typeof jobStart.priorSpentUsd === 'number' && jobStart.priorSpentUsd > 0, 'precondition: a real chain fold on job-start');

  const s = replayRun(spine, []);
  assert.equal(s.resumed, true, 'resumed is keyed on priorSpentUsd, never on resume-seed alone — a narrower record whose absence does not mean "not resumed"');
  assert.equal(s.resumeSeed, null);

  const text = formatReplay(s);
  assert.match(text, /resumed: yes \(no resume-seed detail recorded\)/);
});

test('every non-resumed real archived run agrees: job-end.spentUsd equals its own summed rounds (0 mismatches found)', () => {
  const dirs = [ARCHIVE, BAREAGENT_U, LITECTX_MAINTAINER].filter(existsSync);
  if (dirs.length === 0) { assert.ok(true); return; }
  let checked = 0;
  let mismatches = 0;
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      if (!/^u-[^/]+\.jsonl$/.test(f) || f.includes('gate-audit') || f.endsWith('.lag.jsonl')) continue;
      const spine = parseJsonl(join(dir, f));
      const s = replayRun(spine, []);
      if (s.resumed || s.spentUsd === null || s.thisFileSpend.value === null) continue;
      checked += 1;
      if (s.spendMismatch) mismatches += 1;
    }
  }
  assert.ok(checked > 0, 'precondition: at least one comparable non-resumed run was found across the available archives');
  assert.equal(mismatches, 0, `every non-resumed run's job-end.spentUsd must equal its own summed rounds; found ${mismatches} mismatch(es) among ${checked} checked`);
});

test('spendMismatch fires (never silently) when a constructed non-resumed run genuinely disagrees with its own rounds', () => {
  const events = [
    { type: 'job-start', job: 'x', budgetUsd: 5 },
    { type: 'worker-round', phase: 'fix', costUsd: 1.0, seq: 2 },
    { type: 'worker-round', phase: 'fix', costUsd: 1.0, seq: 3 },
    // job-end claims $5 total spend, but the two real rounds above sum to only $2 —
    // a genuine disagreement on a COLD run (no priorSpentUsd), which must surface.
    { type: 'job-end', outcome: 'green', spentUsd: 5.0, spendComplete: true, seq: 4 },
  ];
  const s = replayRun(events, []);
  assert.equal(s.resumed, false);
  assert.ok(s.spendMismatch, 'a real disagreement on a non-resumed run must be flagged, never hidden');
  assert.ok(Math.abs(s.spendMismatch.diffUsd - 3.0) < 1e-9);
  const text = formatReplay(s);
  assert.match(text, /MISMATCH vs job-end/);
});

// ── F117 landed (PRD TODO #20): verdictType on job-start, model when citable
// (hamr blessed "1" verbatim, 2026-08-25) ───────────────────────────────────

test('u-msdsmkid (archived, pre-F117) prints "class: not recorded (pre-F117 spine)"', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const spinePath = join(BAREAGENT_U, 'u-msdsmkid.jsonl');
  const spine = parseJsonl(spinePath);
  assert.equal(spine.find((e) => e.type === 'job-start').verdictType, undefined, 'precondition: this real archived job-start really predates verdictType');

  const s = replayRun(spine, [], { runId: 'msdsmkid' });
  assert.equal(s.verdictType, null);
  assert.equal(s.model, null);

  const text = formatReplay(s);
  assert.match(text, /class: {3}not recorded \(pre-F117 spine\)/);
  assert.match(text, /model: {3}not recorded/);
});

test('a FRESHLY WRITTEN spine (real runJob() through the $0 test harness) carries its real verdictType, and replay prints it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-replay-f117-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'tests'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  const probe = `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) process.exit(0);
console.log('FAILED tests/test_x.mjs missing'); process.exit(1);\n`;
  writeFileSync(join(dir, 'close.mjs'), probe);
  writeFileSync(join(dir, 'check.mjs'), probe);
  // a real patient is a git checkout: the WORK BRANCH hard rule (PRD v1.57 §3)
  // makes one a precondition of running a job at all — mirrors
  // tests/run.test.js's own makePlanWork exactly.
  initPatientRepo(dir);

  const job = {
    schema: 'job-v1',
    job: 'f117-verdicttype-check',
    description: 'proves job-start carries the real verdictType',
    provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 },
    budgetUsd: 1.5,
    writeScope: ['tests/**'],
    goal: 'Write tests/test_x.mjs with an ok assertion.',
    verdictType: 'green',
    close: [{ name: 'clean-run', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
    tools: ['read', 'write'],
    escalation: { mode: 'decision-ready' },
  };
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
      target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = { ...scriptedProvider([
    { text: 'no tests exist yet' },
    { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'tests', 'test_x.mjs'), content: 'ok\n' } }] },
    { text: 'wrote it' },
  ]), model: 'claude-sonnet-5' };

  const spineFile = join(dir, 'spine.jsonl');
  const outcome = await runJob(job, {
    approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
    workdir: dir, provider, emit: makeSpine(spineFile),
  });
  assert.equal(outcome, 'green');

  const spine = parseJsonl(spineFile);
  const jobStart = spine.find((e) => e.type === 'job-start');
  assert.equal(jobStart.verdictType, 'green');
  assert.equal(jobStart.model, 'claude-sonnet-5');

  const s = replayRun(spine, []);
  assert.equal(s.verdictType, 'green');
  assert.equal(s.model, 'claude-sonnet-5');

  const text = formatReplay(s);
  assert.match(text, /class: {3}green(?!\S)/);
  assert.match(text, /model: {3}claude-sonnet-5/);
  assert.doesNotMatch(text, /pre-F117 spine/);

  assert.equal(summarizeForAllLine(s).class, 'green');
  assert.equal(summarizeForAllLine(s).model, 'claude-sonnet-5', 'the --all model column keeps the FULL string, never truncated');

  // F118 (run→code direction): a freshly-written spine (this SAME real
  // runJob() call) carries `code.version`/`code.sha`, read independently of
  // codeVersion() itself — via package.json and .git/HEAD.
  const realPkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  assert.equal(typeof jobStart.code, 'object');
  assert.equal(jobStart.code.version, realPkg.version);
  assert.match(jobStart.code.sha, /^[0-9a-f]{40}$/);

  assert.deepEqual(s.code, { version: realPkg.version, sha: jobStart.code.sha });
  assert.match(text, new RegExp(`code:    bareloop ${realPkg.version} @ ${jobStart.code.sha.slice(0, 8)}`));
  assert.doesNotMatch(text, /pre-F118 spine/);
});

test('u-msdsmkid (archived, pre-F118) prints "code: not recorded (pre-F118 spine)"', { skip: !existsSync(BAREAGENT_U) && 'no bareagent-u patient on this machine' }, () => {
  const spinePath = join(BAREAGENT_U, 'u-msdsmkid.jsonl');
  const spine = parseJsonl(spinePath);
  assert.equal(spine.find((e) => e.type === 'job-start').code, undefined, 'precondition: this real archived job-start really predates code');

  const s = replayRun(spine, [], { runId: 'msdsmkid' });
  assert.equal(s.code, null);

  const text = formatReplay(s);
  assert.match(text, /code: {4}not recorded \(pre-F118 spine\)/);
});

// ── F119 (2026-08-25): the transport retry fired live on u-mt8yk53k — two
// TLS "bad record mac" alerts, both recovered, run still green. All numbers
// below are grepped straight off the real archived spine (see the FINDINGS
// F119 entry for the full grep output): two `transport-retry` records at
// seq 62/71, both `recovered:true`, both inside step `fix-mypy-strict`'s own
// seq window (step-start seq 35, step-end seq 80); `job-end.spendComplete`
// is `false` for exactly this reason.
test('u-mt8yk53k (archived, F119 live proof) surfaces both transport retries and why the spend is a floor', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const { spine, audit } = loadRun('mt8yk53k');

  // Precondition: this real archived spine really carries two recovered
  // transport-retry records for the same TLS error, both inside the run's
  // one step window — asserted straight off the raw records, not the reader.
  const retries = spine.filter((e) => e.type === 'transport-retry');
  assert.equal(retries.length, 2, 'precondition: this real archived spine carries exactly two transport-retry records');
  assert.ok(retries.every((r) => r.recovered === true), 'precondition: both retries recovered');
  assert.match(retries[0].error, /bad record mac/);

  const s = replayRun(spine, audit, { runId: 'mt8yk53k' });
  assert.equal(s.outcome, 'green');
  assert.equal(s.spendComplete, false);
  assert.equal(s.transportRetryCount, 2);
  assert.equal(s.transportRetriesOutsideWindows, 0, 'both retries fall inside the one step window');
  assert.deepEqual(s.floorReasons, ['transport retry ×2']);
  assert.equal(s.steps.length, 1);
  const oneLineError = retries[0].error.replace(/\s+/g, ' ').trim();
  assert.deepEqual(s.steps[0].transportRetries, {
    count: 2,
    label: 'recovered',
    error: `${oneLineError.slice(0, 80)}…`,
  });

  const text = formatReplay(s);
  assert.match(text, /floor because: transport retry ×2/);
  assert.match(text, /↳ transport retry ×2 \(recovered\) — 0039C0F6E97F0000.*ssl3_read_bytes/);
  // no step ran outside the window, so the header's "outside steps" line
  // never appears for this run.
  assert.doesNotMatch(text, /transport retries outside steps/);

  const row = summarizeForAllLine(s);
  assert.equal(row.hadTransportRetries, true);
  assert.match(row.outcome, /^green ⟲2$/);

  const allText = formatAllLines([{ kind: 'spine', row }]);
  assert.match(allText, /green ⟲2/);
  assert.match(allText, /⟲N transport retry\(ies\)/);
});

test('a run with no transport-retry records carries an empty floorReasons and no ⟲ marker', { skip: !haveArchive && 'no archive on this machine' }, () => {
  const { spine, audit } = loadRun('ms2c0ls7');
  assert.equal(spine.filter((e) => e.type === 'transport-retry').length, 0, 'precondition: this real archived spine has no transport-retry records');
  const s = replayRun(spine, audit, { runId: 'ms2c0ls7' });
  assert.equal(s.transportRetryCount, 0);
  assert.deepEqual(s.floorReasons, [], 'spendComplete is true on this run, so there is nothing to explain');
  const row = summarizeForAllLine(s);
  assert.equal(row.hadTransportRetries, false);
  assert.doesNotMatch(row.outcome, /⟲/);
});
