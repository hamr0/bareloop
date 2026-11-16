// replayRun/formatReplay exit criteria (PRD build-list #6): a report-only
// reconstruction of a run from its own spine + gate-audit — reads only,
// mints no verdict, writes nothing. Every assertion below reads a specific
// value straight off the REAL archived files (no authored fixtures) except
// the two defensive cases the brief allows constructing: a malformed line
// (via the CLI script, on a corrupted COPY of a real file) and a deleted
// `spentUsd` field (spliced out of a real record).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  replayRun, formatReplay, summarizeForAllLine, auditWindow, moneyWithDraft,
} from '../src/replay.js';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';

const ARCHIVE = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u-bareloop';
const BAREAGENT_U = '/home/hamr/PycharmProjects/bareloop-patients/bareagent-u-bareloop';
const LITECTX_MAINTAINER = '/home/hamr/PycharmProjects/bareloop-patients/litectx-maintainer-bareloop';
const SCRIPT = new URL('../scripts/run-replay.mjs', import.meta.url).pathname;

/** @param {string} file */
function parseJsonl(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** @type {string[]} */
const tmpDirs = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});


test('--all never opens a run\'s gate-audit sidecar — PR #23 review item 5, scripts/run-replay.mjs:95', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-replay-noaudit-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'u-fake0001.jsonl'), [
    JSON.stringify({ type: 'job-start', job: 'x', budgetUsd: 5, seq: 1 }),
    JSON.stringify({ type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, seq: 2 }),
  ].join('\n') + '\n');
  // a DIRECTORY where the sidecar filename would be: `readFileSync` throws
  // EISDIR on this the instant anything tries to open it as a file, so a
  // clean `--all` run here is direct proof the sidecar path is never touched
  // (a nonexistent-file check alone wouldn't distinguish "never opened" from
  // "opened, found absent, moved on").
  mkdirSync(join(dir, 'u-fake0001-gate-audit.jsonl'));

  const out = execFileSync('node', [SCRIPT, '--all', dir], { encoding: 'utf8' });
  assert.match(out, /fake0001/, '--all completes and lists the run despite the poisoned sidecar path');
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

// ── the signed layout: header block, per-row time/cost/tripped, CLOSE
// section, loop-shape iterations, and the job/shape --all columns
// (hamr, 2026-08-25) ─────────────────────────────────────────────────────

// ── Spend on resumed runs: chain total vs this-file (hamr, 2026-08-25) ─────

test('(hand-built, synthetic spine) a $0-floor resume (priorSpentUsd: 0, priorSpendComplete: false) still reads resumed: true — PR #23 review item 4, src/replay.js:464', () => {
  // src/run.js:328 emits `priorSpentUsd` on `spentUsd > 0 || priorFloor` — a
  // prior leg that spent exactly $0 but hit a genuine floor still folds this
  // key in, and its own comment states "a fold of $0 that is NOT exact is
  // still a fold". Checking `priorSpentUsd > 0` here would misread this
  // exact case as a fresh (non-resumed) run.
  const events = [
    { type: 'job-start', job: 'x', budgetUsd: 5, priorSpentUsd: 0, priorSpendComplete: false },
    { type: 'job-end', outcome: 'green', spentUsd: 0, spendComplete: true, seq: 2 },
  ];
  const s = replayRun(events, []);
  assert.equal(s.resumed, true, 'presence of priorSpentUsd — even 0 — must mirror src/run.js:328\'s own fold condition');
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

test('(hand-built, synthetic spine) thisFileSpend sums judge-round alongside worker-round — review of PR #23 item 1, src/replay.js:433', () => {
  const events = [
    { type: 'job-start', job: 'x', budgetUsd: 5 },
    { type: 'worker-round', phase: 'fix', costUsd: 0.10, seq: 2 },
    { type: 'judge-round', stage: 'verdict', costUsd: 0.05, seq: 3 },
    { type: 'job-end', outcome: 'green', spentUsd: 0.15, spendComplete: true, seq: 4 },
  ];
  const s = replayRun(events, []);
  assert.equal(s.resumed, false);
  assert.ok(!s.spendMismatch, 'judge-round spend must count toward this-file totals, not read as a mismatch');
  assert.equal(s.thisFileSpend.totalRounds, 2, 'both the worker-round and the judge-round are counted');
  assert.ok(Math.abs(s.thisFileSpend.value - 0.15) < 1e-9, 'this-file spend is 0.10 (worker-round) + 0.05 (judge-round) = 0.15');
});

// ── F117 landed (PRD TODO #20): verdictType on job-start, model when citable
// (hamr blessed "1" verbatim, 2026-08-25) ───────────────────────────────────

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
    // PRD item 27/M2: sha256 of the REAL close.mjs bytes written above — this
    // job actually runs through runJob, so a dummy value would red the run
    // itself as close-tampered.
    close: [{ name: 'clean-run', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED', sha256: hashCloseScriptBytes(probe) }],
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

// ── F119 (2026-08-25): the transport retry fired live on u-mt8yk53k — two
// TLS "bad record mac" alerts, both recovered, run still green. All numbers
// below are grepped straight off the real archived spine (see the FINDINGS
// F119 entry for the full grep output): two `transport-retry` records at
// seq 62/71, both `recovered:true`, both inside step `fix-mypy-strict`'s own
// seq window (step-start seq 35, step-end seq 80); `job-end.spendComplete`
// is `false` for exactly this reason.
// Release-gate finding 3 (2026-08-27, SUGGESTION, src/replay.js:~565-572,
// SYNTHETIC spine — no archive involved): the per-step window filter
// `typeof r.phase === 'string' ? r.phase === phaseTag : true` admits
// phase-less spend records (e.g. `judge-round`) into a step's window by
// `seq` alone. Today `judge-round` only fires from the final close, AFTER
// every step-end (src/planrun.js:1333), so in practice it never lands
// between two adjacent step-start/step-end occurrences of the SAME id — this
// test proves the windowing logic itself is correct on that adversarial
// shape, not just correct by lucky call-site ordering.
test('(hand-built, SYNTHETIC spine) a phase-less spend record between two occurrences of the same step lands in neither window, but still counts toward this-file spend', () => {
  const events = [
    { type: 'job-start', job: 'x', budgetUsd: 5, seq: 0 },
    { type: 'step-start', step: 's', seq: 1 },
    { type: 'worker-round', phase: 'step:s', costUsd: 1.0, seq: 3 },
    { type: 'step-end', step: 's', outcome: 'green', seq: 5 },
    // phase-less, strictly BETWEEN the two occurrences (after end-1, before start-2)
    { type: 'judge-round', stage: 'verdict', costUsd: 0.3, seq: 7 },
    { type: 'step-start', step: 's', seq: 10 },
    // phase-less, strictly INSIDE occurrence 2's window
    { type: 'judge-round', stage: 'verdict', costUsd: 0.5, seq: 15 },
    { type: 'step-end', step: 's', outcome: 'green', seq: 20 },
    { type: 'job-end', outcome: 'green', spentUsd: 1.8, spendComplete: true, seq: 21 },
  ];
  const s = replayRun(events, []);

  assert.equal(s.steps.length, 2, 'precondition: two step-start/step-end occurrences of the same id');
  const [occ1, occ2] = s.steps;

  assert.equal(occ1.rounds, 1, 'occurrence 1 sees only its own worker-round');
  assert.ok(Math.abs(occ1.spentUsd - 1.0) < 1e-9, 'occurrence 1 spend excludes BOTH phase-less records (neither seq 7 nor 15 falls in its (1,5) window)');

  assert.equal(occ2.rounds, 1, 'occurrence 2 includes only the phase-less record strictly inside its own window');
  assert.ok(Math.abs(occ2.spentUsd - 0.5) < 1e-9, 'occurrence 2 spend is exactly the inside record (seq 15), not the between one (seq 7)');

  // the between-record (seq 7) must land in no step at all.
  const totalStepRounds = occ1.rounds + occ2.rounds;
  assert.equal(totalStepRounds, 2, 'the between-record (seq 7) is picked up by neither occurrence — only 2 of the 3 spend records are attributed to a step');

  // ... yet it still counts toward this-file spend (thisFileSpend sums every
  // spendRecord in the file unconditionally, regardless of phase or window).
  assert.equal(s.thisFileSpend.totalRounds, 3, 'this-file spend counts all 3 records, including the one attributed to no step');
  assert.ok(Math.abs(s.thisFileSpend.value - 1.8) < 1e-9, 'this-file spend = 1.0 + 0.3 (between, no step) + 0.5 (inside occurrence 2) = 1.8');
});

// ---------------------------------------------------------------------------
// panel item 4 (2026-09-25): per-step `attempts` — one entry per exit-eval
// inside the step's own window, outcome green only when every result in
// that exit-eval passed.
// ---------------------------------------------------------------------------

test('replayRun: step attempts — 2 exit-evals (fail then pass) in one step window produce 2 attempts, in order', () => {
  const spine = [
    { type: 'job-start', job: 'attempts-job', ts: '2026-01-01T00:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'step-start', step: 'x', ts: '2026-01-01T00:00:01.000Z', seq: 2 },
    {
      type: 'exit-eval', step: 'x', iteration: 1, seq: 3, ts: '2026-01-01T00:00:02.000Z', results: [{ type: 'check-passes', pass: false }],
    },
    {
      type: 'exit-eval', step: 'x', iteration: 2, seq: 4, ts: '2026-01-01T00:00:03.000Z', results: [{ type: 'check-passes', pass: true }, { type: 'tree-changed', pass: true }],
    },
    { type: 'step-end', step: 'x', outcome: 'green', seq: 5, ts: '2026-01-01T00:00:04.000Z' },
    {
      type: 'job-end', outcome: 'green', spentUsd: 0, spendComplete: true, seq: 6, ts: '2026-01-01T00:00:05.000Z',
    },
  ];
  const s = replayRun(spine, [], { runId: 'attempts-run' });
  assert.equal(s.steps.length, 1);
  assert.deepEqual(s.steps[0].attempts, [
    { n: 1, iteration: 1, outcome: 'red' },
    { n: 2, iteration: 2, outcome: 'green' },
  ]);
  assert.deepEqual(s.steps[0].checks, { passed: 1, failed: 1 });
});

test('replayRun: a step with rounds but NO exit-eval (crashed before any check ran) has an EMPTY attempts array, never a fabricated one', () => {
  const spine = [
    { type: 'job-start', job: 'noeval-job', ts: '2026-01-01T00:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'step-start', step: 'y', ts: '2026-01-01T00:00:01.000Z', seq: 2 },
    {
      type: 'worker-round', phase: 'step:y', costUsd: 0.01, tokens: 10, seq: 3, ts: '2026-01-01T00:00:02.000Z',
    },
    {
      type: 'escalation', category: 'provider-red', decision: 'x', seq: 4, ts: '2026-01-01T00:00:03.000Z',
    },
    { type: 'step-end', step: 'y', outcome: 'escalated', seq: 5, ts: '2026-01-01T00:00:04.000Z' },
    {
      type: 'job-end', outcome: 'provider-red', spentUsd: 0.01, spendComplete: false, seq: 6, ts: '2026-01-01T00:00:05.000Z',
    },
  ];
  const s = replayRun(spine, [], { runId: 'noeval-run' });
  assert.equal(s.steps.length, 1);
  assert.deepEqual(s.steps[0].attempts, []);
});

test('replayRun: an exit-eval with an EMPTY results array reads RED, never a fabricated green', () => {
  const spine = [
    { type: 'job-start', job: 'empty-results-job', ts: '2026-01-01T00:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'step-start', step: 'z', ts: '2026-01-01T00:00:01.000Z', seq: 2 },
    {
      type: 'exit-eval', step: 'z', iteration: 1, seq: 3, ts: '2026-01-01T00:00:02.000Z', results: [],
    },
    { type: 'step-end', step: 'z', outcome: 'red', seq: 4, ts: '2026-01-01T00:00:03.000Z' },
    {
      type: 'job-end', outcome: 'job-red', spentUsd: 0, spendComplete: true, seq: 5, ts: '2026-01-01T00:00:04.000Z',
    },
  ];
  const s = replayRun(spine, [], { runId: 'empty-results-run' });
  assert.deepEqual(s.steps[0].attempts, [{ n: 1, iteration: 1, outcome: 'red' }]);
});

// ---------------------------------------------------------------------------
// F195: `bareloop replay`'s `behaviour` (fed by `replayRun`'s top-level
// `behaviour` field, `formatReplay`'s printed "N tool calls" line) was
// reading the WHOLE gate-audit sidecar unscoped — a sidecar CAN carry rows
// from an earlier, unrelated run sharing the same filename (the panel's
// item 2 fix already worked around this on its own side; this closes the
// gap at the ONE shared owner, `src/replay.js`, so the CLI and the panel
// can never disagree again).
// ---------------------------------------------------------------------------

test('auditWindow: startTs/endTs derived from job-start/job-end ts, -Infinity/Infinity when either is missing', () => {
  const jobStart = { ts: '2026-09-05T12:00:00.000Z' };
  const jobEnd = { ts: '2026-09-05T12:05:00.000Z' };
  assert.deepEqual(auditWindow(jobStart, jobEnd), {
    startTs: Date.parse('2026-09-05T12:00:00.000Z'),
    endTs: Date.parse('2026-09-05T12:05:00.000Z'),
  });
  assert.deepEqual(auditWindow(null, jobEnd), { startTs: -Infinity, endTs: Date.parse('2026-09-05T12:05:00.000Z') });
  assert.deepEqual(auditWindow(jobStart, null), { startTs: Date.parse('2026-09-05T12:00:00.000Z'), endTs: Infinity });
  assert.deepEqual(auditWindow(null, null), { startTs: -Infinity, endTs: Infinity });
});

test('RED->GREEN (F195): replayRun scopes gate-audit rows to this run\'s own job-start..job-end window — a shared sidecar\'s earlier-run rows no longer inflate the top-level `behaviour` figure', () => {
  const spine = [
    { type: 'job-start', job: 'shared-sidecar-job', ts: '2026-09-05T12:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'worker-round', phase: 'plan', costUsd: 0.01, tokens: 100, seq: 2, ts: '2026-09-05T12:00:01.000Z' },
    { type: 'job-end', outcome: 'green', spentUsd: 0.01, spendComplete: true, seq: 3, ts: '2026-09-05T12:00:05.000Z' },
  ];
  const audit = [
    // an EARLIER, unrelated run's rows sharing this sidecar filename by
    // coincidence — hours before this run's own job-start
    { ts: '2026-09-05T06:00:00.000Z', action: { type: 'read', path: 'other-run-a.js', args: { tool: 'shell_read' } }, decision: 'allow' },
    { ts: '2026-09-05T06:00:01.000Z', action: { type: 'read', path: 'other-run-b.js', args: { tool: 'shell_read' } }, decision: 'allow' },
    { ts: '2026-09-05T06:00:02.000Z', action: { type: 'edit', path: 'other-run-c.js', args: { tool: 'shell_edit' } }, decision: 'allow' },
    // this run's own row
    { ts: '2026-09-05T12:00:01.500Z', action: { type: 'read', path: 'real-file.js', args: { tool: 'shell_read' } }, decision: 'allow' },
  ];
  // pre-fix behaviour (what the bug looked like): every row in the sidecar
  // unconditionally counted, 4 total — reproduced here directly against the
  // raw unscoped array, never asserted, just documented for contrast.
  // post-fix: replayRun itself must report only the 1 row inside its own window.
  const s = replayRun(spine, audit, { runId: 'shared-sidecar-run' });
  assert.equal(s.behaviour.totalCalls, 1);
  assert.deepEqual(s.behaviour.byTool, { shell_read: 1 });
});

// ---------------------------------------------------------------------------
// Panel build item 1 (2026-09-26): `fixLoop` (the post-step outer-close
// precheck + fix-loop iterations) and `scoutPlan` (a plan run's own pre-step
// scout/plan rounds) — both invisible before this addition. See src/replay.js's
// own construction comments for the mechanism and the field provenance.
// ---------------------------------------------------------------------------

// Panel P2 defect 2 (hamr live-watched run mujjtrvd, 2026-09-27): a LIVE
// run's fix-loop attempt whose window hasn't closed yet (no close-verdict/
// run-end/escalation boundary has landed after its iteration-start) used to
// be fabricated as outcome 'red' — the panel's `partBoxState` checks
// `part.outcome` before `isLastLivePart`, so a still-running fix loop read
// as "stopped" (no pulse) instead of "running". Fixture is the first 71
// lines of the REAL archived mujjtrvd spine — sliced right after step 2
// (`strict-clean-whole-src`, step-start seq 69)'s OWN first iteration-start
// (seq 71, its own micro-loop's attempt 1) and before its first exit-eval
// (seq 80), the exact mid-run instant hamr's panel snapshot
// (`/tmp/.../scratchpad/live.json`) captured.
//
// F196 (found while building the above): at this instant step 2 has NOT
// step-ended yet (its `step-end` never lands in this 71-line slice) — the
// OLD `lastStepEndSeq` (step 1 `type-checks-jsdoc`'s step-end at seq 68)
// left step 2's seq range wide open, so ITS OWN iteration-start at seq 71
// leaked in as a fake fix-loop attempt (fixLoop existed with 1 open
// attempt, plus a phantom `fix` part after step 2). Fixed at the source:
// the fix loop may only begin once EVERY step has reached its own
// step-end. At this same mid-run instant that now means fixLoop is null
// and there is no `fix` part at all — step 2 itself is the last live part.
test('replayRun: mujjtrvd sliced mid-run (real archived spine, truncated right after step 2\'s own OPEN iteration-start) reports fixLoop null — a still-running step\'s own micro-loop iteration must never leak in as a fake fix-loop attempt', () => {
  const spine = parseJsonl(new URL('./fixtures/mujjtrvd-midrun.jsonl', import.meta.url).pathname);
  const s = replayRun(spine, [], { runId: 'mujjtrvd' });
  assert.equal(s.steps.length, 2, 'precondition: two step-starts on this slice');
  assert.equal(s.steps[1].id, 'strict-clean-whole-src');
  assert.equal(s.steps[1].stepEndSeq, Infinity, 'precondition: step 2 has not step-ended yet in this slice');
  assert.equal(s.fixLoop, null, 'a still-running step must never let its own iteration-start leak in as a fake fix-loop attempt');
  const fixPart = s.parts.find((p) => p.id === 'fix');
  assert.equal(fixPart, undefined, 'no fix part should exist while step 2 is still running');
  const lastPart = s.parts[s.parts.length - 1];
  assert.equal(lastPart.kind, 'step', 'step 2 (still running) is the last live part, not a phantom fix box after it');
  assert.equal(lastPart.label, 'strict-clean-whole-src');
});

// Panel build item 6 (2026-09-26): `parts` — the ONE ordered list of a run's
// own high-level pieces (scout, plan, each step occurrence in run order, a
// replan window between two steps, the fix loop, and a synthetic-only
// leftover judge-round bucket) driving both the Run tab's map+cards and the
// Audit tab's groups.
// build item 8 (2026-09-28, panel session mul5fofw): "plan · 1 call · 0.0s ·
// $0.28" — a real $0.28/20623-token paid call cannot take 0.0s. ROOT CAUSE
// (measured on this exact real spine): the plan part's wallMs window used
// to be `windowWallMs(scoutTsHi, firstTs)`, where `scoutTsHi` is literally
// `planRoundsInitialArr[0].ts` — the plan round's OWN completion
// timestamp — so the window started at the call's own end and measured
// only the ~12ms gap to the next logged record (the following step-start),
// never the call's real ~82s duration (scout's own last round 11:15:00.335Z
// -> the plan round's own ts 11:16:22.667Z). Fixed by anchoring the window
// to scout's own true end (its last round's ts) and plan's own true end
// (its last round's ts) instead.
test('RED->GREEN (build item 8): a minimal synthetic spine reproducing mul5fofw\'s exact shape — one scout round, one plan round, a step-start 12ms later — gives the plan part its real ~82s wall time, never 0', () => {
  const spine = [
    { type: 'job-start', job: 'x', ts: '2026-09-28T11:14:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'worker-round', phase: 'scout', costUsd: 0.1, tokens: 100, seq: 2, ts: '2026-09-28T11:15:00.335Z' },
    // the plan round's OWN ts is stamped at completion — 82332ms after
    // scout's last round, itself the REAL duration of this paid call.
    { type: 'worker-round', phase: 'plan', costUsd: 0.28259700000000004, tokens: 20623, seq: 3, ts: '2026-09-28T11:16:22.667Z' },
    // the next logged record follows within milliseconds — the OLD bug used
    // this gap (not the call's own real duration) as "the" plan wall time.
    { type: 'step-start', step: 'strict-type-checks-js', rounds: 14, tools: [], seq: 4, ts: '2026-09-28T11:16:22.679Z' },
  ];
  const s = replayRun(spine, [], { runId: 'synthetic-mul5fofw-shape' });
  const plan = s.parts.find((p) => p.kind === 'plan');
  assert.ok(plan, 'expected a plan part');
  assert.equal(plan.rounds, 1);
  assert.equal(plan.wallMs, 82332, `expected the real 82332ms call duration, got ${plan.wallMs}`);
});

const MUL5FOFW_SPINE = '/home/hamr/.config/bareloop/panel-sessions/smul3ar4uzs8j/source-seed/pulselog-panel-strict-bareloop/u-mul5fofw.jsonl';
test(
  'replayRun: parts on the real archived run mul5fofw — the plan part\'s wallMs is the real ~82.3s the paid call took, never 0',
  { skip: !existsSync(MUL5FOFW_SPINE) && 'real fixture not present on this machine' },
  () => {
    const spine = parseJsonl(MUL5FOFW_SPINE);
    const s = replayRun(spine, [], { runId: 'mul5fofw' });
    const plan = s.parts.find((p) => p.kind === 'plan');
    assert.ok(plan, 'expected a plan part on this run');
    assert.equal(plan.rounds, 1, 'precondition: exactly one plan round on this real run');
    assert.ok(Math.abs(plan.spentUsd - 0.28259700000000004) < 1e-9, 'precondition: the real $0.28 cost');
    // scout's own last worker-round ts (11:15:00.335Z) -> the plan round's
    // own ts (11:16:22.667Z) = 82332ms, verified directly against the spine.
    assert.equal(plan.wallMs, 82332, `expected the real ~82.3s call duration, got ${plan.wallMs}ms`);
  },
);

test('replayRun: parts — a judge-round with no step/fix/scout/plan window covering it gets its own synthetic {kind:\'judge\'} box (fixture-built; no real archive measured against this build carries one)', () => {
  const spine = [
    { type: 'job-start', seq: 1, ts: '2026-09-26T00:00:00.000Z', job: 'synthetic-judge-fixture' },
    { type: 'step-start', seq: 2, ts: '2026-09-26T00:00:01.000Z', step: 'only-step' },
    { type: 'worker-round', seq: 3, ts: '2026-09-26T00:00:02.000Z', phase: 'step:only-step', costUsd: 0.01 },
    { type: 'step-end', seq: 4, ts: '2026-09-26T00:00:03.000Z', step: 'only-step', outcome: 'green' },
    // a bare judge-round after the step ended, with no outer-close/fix-loop
    // record at all — outside every window `parts` otherwise builds.
    { type: 'judge-round', seq: 5, ts: '2026-09-26T00:00:04.000Z', costUsd: 0.002 },
    { type: 'run-end', seq: 6, ts: '2026-09-26T00:00:05.000Z', outcome: 'green' },
    { type: 'job-end', seq: 7, ts: '2026-09-26T00:00:06.000Z', outcome: 'green', spentUsd: 0.012, spendComplete: true },
  ];
  const s = replayRun(spine, [], { runId: 'synthetic-judge-fixture' });
  assert.deepEqual(s.parts.map((p) => p.kind), ['step', 'judge']);
  assert.equal(s.parts[1].id, 'judge');
  assert.equal(s.parts[1].rounds, 1);
  assert.equal(s.parts[1].attempts.length, 1);
});

// ---------------------------------------------------------------------------
// draftSpentUsd / moneyWithDraft — hamr's ruling 2026-09-28 ("one cap covers
// drafting + run"): a run's summary carries its drafting share off
// job-start's own field, and every money display uses the ONE shared
// formatter rather than each hand-composing "$X ($Y drafting) of $Z".
// ---------------------------------------------------------------------------

test('replayRun: draftSpentUsd reads off job-start\'s own field, never priorSpentUsd — null when absent', () => {
  const withDraft = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5, draftSpentUsd: 0.81 },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(withDraft.draftSpentUsd, 0.81);
  assert.equal(withDraft.resumed, false, 'a drafting fold is never a resume');

  const withoutDraft = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5 },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(withoutDraft.draftSpentUsd, null, 'a run that never drafted carries no decorative 0');
});

test('moneyWithDraft (PRD v1.106 Part 5 Q4): "$3.71 run + $0.8100 drafting = $4.5200 of $5.00" with a cap, no cap without, the sum left out when the run\'s number is not given, unchanged with no draft share', () => {
  assert.equal(moneyWithDraft('$3.71', 0.81, 5, true, 3.71), '$3.71 run + $0.8100 drafting = $4.5200 of $5.00');
  assert.equal(moneyWithDraft('$3.71', 0.81, undefined, true, 3.71), '$3.71 run + $0.8100 drafting = $4.5200');
  assert.equal(moneyWithDraft('$3.71', 0.81, 5), '$3.71 run + $0.8100 drafting of $5.00', 'no run number: no sum is invented');
  // the real run mve5y8fa: run $0.0054, drafting $0.0035, total $0.0089 in runs.jsonl
  assert.equal(moneyWithDraft('$0.0054', 0.0035, 1, true, 0.0054), '$0.0054 run + $0.0035 drafting = $0.0089 of $1.00');
  assert.equal(moneyWithDraft('$3.68', null, 5), '$3.68 of $5.00');
  assert.equal(moneyWithDraft('$3.68', null), '$3.68', 'a run without a drafting share prints exactly what it always did');
});

// hamr's ruling 2026-09-28 (2nd addendum, "drafting completeness travels
// with draftSpentUsd") — an incomplete drafting fold reads "at least" on
// BOTH the bracket and the leading figure (a reader summing the two must
// never take the leading number as exact when the bracket beside it isn't).
test('moneyWithDraft: an incomplete draftSpendComplete:false reads "at least" on the bracket AND the leading spendCore', () => {
  assert.equal(
    moneyWithDraft('$3.71', 0.81, 5, false, 3.71),
    'at least $3.71 run + at least $0.8100 drafting = at least $4.5200 of $5.00',
  );
  // a complete fold (true, or the parameter simply omitted) is UNCHANGED —
  // never a new enum value anywhere else in the string.
  assert.equal(moneyWithDraft('$3.71', 0.81, 5, true, 3.71), '$3.71 run + $0.8100 drafting = $4.5200 of $5.00');
  assert.equal(moneyWithDraft('$3.71', 0.81, 5, undefined, 3.71), '$3.71 run + $0.8100 drafting = $4.5200 of $5.00');
  assert.equal(moneyWithDraft('$3.71', 0.81, 5, null, 3.71), '$3.71 run + $0.8100 drafting = $4.5200 of $5.00');
});

test('moneyWithDraft: an already-floor spendCore (e.g. a died run\'s "at least $X") never doubles the "at least" prefix when the draft is also incomplete', () => {
  assert.equal(
    moneyWithDraft('at least $0.0182', 0.81, 5, false, 0.0182),
    'at least $0.0182 run + at least $0.8100 drafting = at least $0.8282 of $5.00',
  );
  assert.equal(
    moneyWithDraft('≥$3.71', 0.81, 5, false, 3.71),
    '≥$3.71 run + at least $0.8100 drafting = at least $4.5200 of $5.00',
    'the run\'s own "≥" floor spelling is recognized too, never double-prefixed',
  );
});

test('moneyWithDraft: no drafting share at all -> draftSpendComplete is never even consulted, output unchanged', () => {
  assert.equal(moneyWithDraft('$3.68', null, 5, false), '$3.68 of $5.00');
});

test('summarizeForAllLine: the spend column carries the drafting share for a run that has one, unchanged for a run that does not', () => {
  const withDraft = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5, draftSpentUsd: 0.81, shape: 'plan' },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.match(summarizeForAllLine(withDraft).spend, /^\$3\.7100 run \+ \$0\.8100 drafting = \$4\.5200$/);

  const withoutDraft = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5, shape: 'plan' },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.68, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(summarizeForAllLine(withoutDraft).spend, '$3.6800', 'a run without a drafting share prints exactly what it always did');
});

// hamr's ruling 2026-09-28 (2nd addendum) — replayRun reads draftSpendComplete
// off job-start's own field, defaulting to true on an archive that predates
// the companion field (it was exact then, the field just didn't exist yet).
test('replayRun: draftSpendComplete reads off job-start — null when there is no drafting fold, true on a pre-field archive, false only when the fold explicitly said so', () => {
  const noDraft = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5 },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(noDraft.draftSpendComplete, null, 'no drafting fold at all -> never paired with a draftSpentUsd of null');

  const preField = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5, draftSpentUsd: 0.81 },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(preField.draftSpendComplete, true, 'an archive with draftSpentUsd but no companion field defaults to true (it was exact when it was written)');

  const incomplete = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5, draftSpentUsd: 0.81, draftSpendComplete: false },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(incomplete.draftSpendComplete, false);
});

test('summarizeForAllLine: an INCOMPLETE drafting fold reads "at least" on both the leading spend and the bracket, off the CLI\'s own 4-decimal money() — the CLI\'s own --all output is unchanged (never migrated to 2 decimals)', () => {
  const incomplete = replayRun([
    { type: 'job-start', seq: 1, ts: '2026-09-28T00:00:00.000Z', job: 'x', budgetUsd: 5, draftSpentUsd: 0.81, draftSpendComplete: false, shape: 'plan' },
    { type: 'job-end', seq: 2, ts: '2026-09-28T00:00:01.000Z', outcome: 'green', spentUsd: 3.71, spendComplete: true },
  ], [], { runId: 'x' });
  assert.equal(summarizeForAllLine(incomplete).spend, 'at least $3.7100 run + at least $0.8100 drafting = at least $4.5200');
});
