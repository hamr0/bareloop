// hamr 2026-10-06 (option A): a panel-authored run's DRAFTING is the FIRST part of its views. The server serves it as
// `detail.parts[0]` and moves every other index with it (legDividers.beforePart, the flat Audit rows' partIndex, the
// rounds endpoint's `part`) — each consumer is proven here against the SAME run served without the drafting log.
// Real files in a scratch home; the run is a two-leg spine so the leg dividers are in play.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { getRunDetail, getRunAudit, getRunRounds } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'drafting-part-')); dirs.push(d); return d; };
const at = (h, m, s = 0) => `2026-10-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
const jl = (rows) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

const DRAFT = 0.0755; // = the four metered calls below
const LOG = [
  { kind: 'step-start', no: 0, id: 'setup', label: 'checking setup', at: at(9, 0, 0) },
  { kind: 'step-end', no: 0, status: 'done', label: 'checking setup', at: at(9, 0, 5) },
  { kind: 'step-start', no: 1, id: 'scout', label: 'scouting repo', at: at(9, 0, 5) },
  { kind: 'call', no: 1, step: 'scout', label: 'author-scout', model: 'deepseek-flash', costUsd: 0.01, unpricedRounds: 0, at: at(9, 0, 30) },
  { kind: 'step-end', no: 1, status: 'done', label: 'scouting repo', at: at(9, 0, 40) },
  { kind: 'step-start', no: 2, id: 'confirm', label: 'confirming plan', at: at(9, 0, 40) },
  { kind: 'call', no: 2, step: 'confirm', label: 'confirm', model: 'deepseek-flash', costUsd: 0.02, unpricedRounds: 0, at: at(9, 1, 0) },
  { kind: 'call', no: 2, step: 'confirm', label: 'confirm#2', model: 'deepseek-flash', costUsd: 0.0155, unpricedRounds: 0, at: at(9, 2, 0) },
  { kind: 'step-end', no: 2, status: 'done', label: 'confirming plan', at: at(9, 2, 10) },
  { kind: 'step-start', no: 3, id: 'draft', label: 'drafting', at: at(9, 2, 10) },
  { kind: 'call', no: 3, step: 'draft', label: 'author', model: 'deepseek-flash', costUsd: 0.03, unpricedRounds: 0, at: at(9, 4, 38) },
  { kind: 'step-end', no: 3, status: 'done', label: 'drafting', at: at(9, 4, 38) },
];

/** a panel-authored, two-leg run. `withLog` plants the session's drafting log (a Reuse/CLI run has none). */
function makeRun({ withLog, draftSpent = DRAFT, runid = 'run1', row = {} }) {
  const home = tmp();
  const sess = join(home, 'panel-sessions', 'sabc');
  const dir = join(sess, 'source-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  if (withLog) writeFileSync(join(sess, DRAFT_LOG_FILE), jl(LOG));
  const plan = { schema: 'plan-v1', steps: [{ id: 'fix-a' }, { id: 'fix-b' }] };
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, jl([
    { type: 'job-start', job: 'job', specHash: 'h1', budgetUsd: 8, shape: 'plan', goal: 'g', ts: at(10, 0), seq: 1, ...(draftSpent === null ? {} : { draftSpentUsd: draftSpent, draftSpendComplete: true }) },
    { type: 'plan-accepted', plan, ts: at(10, 1), seq: 2 },
    { type: 'step-start', step: 'fix-a', ts: at(10, 3), seq: 2.5 },
    { type: 'worker-round', kind: 'turn', costUsd: 1, phase: 'step:fix-a', ts: at(10, 5), seq: 3 },
    { type: 'step-end', step: 'fix-a', outcome: 'green', ts: at(10, 6), seq: 3.5 },
    { type: 'step-start', step: 'fix-b', ts: at(10, 7), seq: 3.6 },
    { type: 'worker-round', kind: 'turn', costUsd: 2, phase: 'step:fix-b', ts: at(10, 9), seq: 4 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 3, engagementSpentUsd: 3, spendComplete: true, ts: at(10, 20), seq: 5 },
    { type: 'leg-resume', leg: 2, after: 'cap-halt', at: at(14, 0), ts: at(14, 0), seq: 6 },
    { type: 'job-start', job: 'job', specHash: 'h1', budgetUsd: 12, shape: 'plan', goal: 'g', priorSpentUsd: 3, priorSpendComplete: true, priorWallMs: 1_200_000, ts: at(14, 0), seq: 7 },
    { type: 'plan-accepted', plan, ts: at(14, 1), seq: 8 },
    { type: 'step-start', step: 'fix-b', ts: at(14, 2), seq: 8.5 },
    { type: 'worker-round', kind: 'turn', costUsd: 2, phase: 'step:fix-b', ts: at(14, 5), seq: 9 },
    { type: 'step-end', step: 'fix-b', outcome: 'green', ts: at(14, 8), seq: 9.5 },
    { type: 'job-end', outcome: 'green', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: at(14, 10), seq: 10 },
  ]));
  writeFileSync(join(dir, `u-${runid}-gate-audit.jsonl`), jl([
    { ts: at(10, 5, 30), action: { type: 'read', path: 'a.js' }, decision: 'allow' },
    { ts: at(10, 9, 30), action: { type: 'edit', path: 'b.js' }, decision: 'allow' },
    { ts: at(14, 5, 30), action: { type: 'edit', path: 'b.js' }, decision: 'allow' },
  ]));
  appendRun({ at: at(10, 0), runid, job: 'job', spine, patient: null, via: 'run-u', pid: 999999, capUsd: 8, ...row }, { home });
  return { home, runid };
}

const withD = () => makeRun({ withLog: true });
const without = () => makeRun({ withLog: false });

test('drafting part: FIRST in detail.parts; its total IS the spine\'s draftSpentUsd (and the calls sum to it); the other parts follow untouched', () => {
  const a = withD();
  const b = without();
  const d = getRunDetail(a.runid, { home: a.home });
  const base = getRunDetail(b.runid, { home: b.home });
  assert.equal(base.parts.some((p) => p.kind === 'drafting'), false, 'no log, no drafting part (a Reuse / CLI / older run)');
  const p0 = d.parts[0];
  assert.equal(p0.kind, 'drafting');
  assert.equal(p0.label, 'drafting');
  assert.equal(p0.leg, 1, 'drafting belongs to leg 1 only');
  assert.equal(p0.spentUsd, d.draftSpentUsd, 'the part\'s total is the spine\'s own drafting figure');
  assert.equal(p0.spentUsd, DRAFT);
  assert.equal(p0.spendComplete, d.draftSpendComplete);
  const sumCalls = p0.draftSteps.flatMap((s) => s.calls).reduce((n, c) => n + c.costUsd, 0);
  assert.ok(Math.abs(sumCalls - p0.spentUsd) < 1e-9, `the logged calls (${sumCalls}) sum to the spine's figure (${p0.spentUsd}) — a mismatch is a failure, never a silent display`);
  assert.equal(p0.rounds, 4, 'four metered calls');
  assert.equal(p0.wallMs, (4 * 60 + 38) * 1000, 'first step start to last step end');
  assert.deepEqual(p0.draftSteps.map((s) => s.id), ['setup', 'scout', 'confirm', 'draft']);
  assert.deepEqual(p0.draftSteps.find((s) => s.id === 'confirm').calls.map((c) => c.label), ['confirm', 'confirm#2']);
  assert.deepEqual(d.parts.slice(1), base.parts, 'every other part is byte-identical to the run served without drafting');
});

test('drafting part: no part when the spine carries no drafting figure, or the log has no metered call, or the run sits in no session folder', () => {
  const noFigure = makeRun({ withLog: true, draftSpent: null, runid: 'nofig' });
  assert.equal(getRunDetail('nofig', { home: noFigure.home }).parts.some((p) => p.kind === 'drafting'), false);
  const a = withD();
  writeFileSync(join(a.home, 'panel-sessions', 'sabc', DRAFT_LOG_FILE), jl(LOG.filter((e) => e.kind !== 'call')));
  assert.equal(getRunDetail(a.runid, { home: a.home }).parts.some((p) => p.kind === 'drafting'), false, 'steps without a call are not a drafting spend');
  // a CLI run: the log exists in some session, but this run's spine/patient is not inside that folder
  const c = withD();
  const outside = tmp();
  mkdirSync(outside, { recursive: true });
  const spine = join(outside, 'u-cli.jsonl');
  writeFileSync(spine, jl([{ type: 'job-start', job: 'j', draftSpentUsd: 0.5, ts: at(10, 0), seq: 1 }, { type: 'job-end', outcome: 'green', spentUsd: 0.5, spendComplete: true, ts: at(10, 5), seq: 2 }]));
  appendRun({ at: at(10, 0), runid: 'cli', job: 'j', spine, patient: null, via: 'run-u' }, { home: c.home });
  assert.equal(getRunDetail('cli', { home: c.home }).parts.some((p) => p.kind === 'drafting'), false);
});

test('index shift: legDividers.beforePart moves with the list (drafting stays ABOVE the leg 2 divider)', () => {
  const a = withD();
  const b = without();
  const d = getRunDetail(a.runid, { home: a.home });
  const base = getRunDetail(b.runid, { home: b.home });
  assert.equal(base.legDividers.length, 1);
  assert.equal(d.legDividers[0].beforePart, base.legDividers[0].beforePart + 1);
  const first2 = d.parts.findIndex((p) => typeof p.leg === 'number' && p.leg >= 2);
  assert.equal(d.legDividers[0].beforePart, first2, 'the divider sits right before the first leg-2 part of the SHOWN list');
  assert.equal(d.parts[0].kind, 'drafting');
});

test('index shift: flat Audit rows — partIndex addresses the shown list and the Step column still names the same part', () => {
  const a = withD();
  const b = without();
  const d = getRunDetail(a.runid, { home: a.home });
  const rowsD = getRunAudit(a.runid, { home: a.home }).rows;
  const rowsB = getRunAudit(b.runid, { home: b.home }).rows;
  assert.equal(rowsD.length, 3);
  assert.deepEqual(rowsD.map((r) => r.partLabel), rowsB.map((r) => r.partLabel), 'the Step column names the same part');
  assert.ok(rowsB.every((r) => r.partIndex !== null), 'the fixture assigns every row to a part');
  assert.deepEqual(rowsD.map((r) => r.partIndex), rowsB.map((r) => r.partIndex + 1));
  for (const r of rowsD) assert.ok(r.partLabel.startsWith(d.parts[r.partIndex].label), `detail.parts[${r.partIndex}] (${d.parts[r.partIndex].label}) IS the part the row names (${r.partLabel})`);
  assert.ok(rowsD.every((r) => r.partIndex !== 0), 'no tool call is ever assigned to the drafting part');
});

test('index shift: the rounds endpoint — shown index k+1 serves what k served; 0 is the drafting part and has no rounds table', () => {
  const a = withD();
  const b = without();
  const d = getRunDetail(a.runid, { home: a.home });
  const base = getRunDetail(b.runid, { home: b.home });
  assert.equal(getRunRounds(a.runid, { part: 0, attempt: 1 }, { home: a.home }), null);
  assert.equal(d.parts.length, base.parts.length + 1);
  for (let k = 0; k < base.parts.length; k += 1) {
    const before = getRunRounds(b.runid, { part: k, attempt: 1 }, { home: b.home });
    const after = getRunRounds(a.runid, { part: k + 1, attempt: 1 }, { home: a.home });
    assert.equal(after === null, before === null, `part ${k + 1}`);
    if (before === null) continue;
    assert.equal(after.part, k + 1);
    assert.equal(after.step, before.step, 'the same part');
    assert.deepEqual({ ...after, part: 0, rounds: after.rounds.map((r) => ({ ...r, toolCalls: r.toolCalls?.map((t) => ({ ...t, partIndex: 0 })) })) },
      { ...before, part: 0, rounds: before.rounds.map((r) => ({ ...r, toolCalls: r.toolCalls?.map((t) => ({ ...t, partIndex: 0 })) })) });
  }
  assert.equal(getRunRounds(a.runid, { part: base.parts.length + 1, attempt: 1 }, { home: a.home }), null, 'one past the end is still out of range');
});

// I4 (fix-ledger, hamr 2026-10-06): every test above serves a FINISHED spine. A RUNNING panel-authored run is the case
// the live poll hits every 2 s: the drafting part must still head the list, the live step must be the LAST shown part
// (the page marks the last part of a live run `running`), and the Audit rows / rounds endpoint must address that same
// shown index. REAL live process (named run-u.mjs, so `isLiveRunner` reads it as a runner) — no stub stands in for liveness.
test('live run: a RUNNING panel-authored run keeps drafting first, the live step LAST, and Audit/rounds indices on the shown list', async (t) => {
  const home = tmp();
  const sess = join(home, 'panel-sessions', 'sabc');
  const dir = join(sess, 'source-x', 'job-bareloop');
  const patient = join(sess, 'source-x', 'tree');
  mkdirSync(dir, { recursive: true });
  mkdirSync(patient, { recursive: true });
  writeFileSync(join(sess, DRAFT_LOG_FILE), jl(LOG));
  const script = join(tmp(), 'run-u.mjs');
  writeFileSync(script, 'setInterval(() => {}, 1000);\n');
  const child = spawn(process.execPath, [script], { stdio: 'ignore' });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const plan = { schema: 'plan-v1', steps: [{ id: 'fix-a' }, { id: 'fix-b' }] };
  const now = Date.now();
  const ts = (/** @type {number} */ agoSec) => new Date(now - agoSec * 1000).toISOString();
  const spine = join(dir, 'u-live1.jsonl');
  writeFileSync(spine, jl([
    { type: 'job-start', job: 'job', specHash: 'h1', budgetUsd: 8, shape: 'plan', goal: 'g', ts: ts(300), seq: 1, draftSpentUsd: DRAFT, draftSpendComplete: true },
    { type: 'plan-accepted', plan, ts: ts(290), seq: 2 },
    { type: 'step-start', step: 'fix-a', ts: ts(280), seq: 2.5 },
    { type: 'worker-round', kind: 'turn', costUsd: 1, phase: 'step:fix-a', ts: ts(270), seq: 3 },
    { type: 'step-end', step: 'fix-a', outcome: 'green', ts: ts(260), seq: 3.5 },
    { type: 'step-start', step: 'fix-b', ts: ts(250), seq: 3.6 },
    { type: 'worker-round', kind: 'turn', costUsd: 2, phase: 'step:fix-b', ts: ts(240), seq: 4 },
  ]));
  // the LIVE leg's tool log sits in the patient tree (the run has no job-end yet)
  writeFileSync(join(patient, 'gate-audit.jsonl'), jl([
    { ts: ts(265), action: { type: 'read', path: 'a.js' }, decision: 'allow' },
    { ts: ts(235), action: { type: 'edit', path: 'b.js' }, decision: 'allow' },
  ]));
  appendRun({ at: ts(300), runid: 'live1', job: 'job', spine, patient, via: 'run-u', pid: child.pid, capUsd: 8 }, { home });

  const d = getRunDetail('live1', { home });
  assert.ok(d, 'the live run is served');
  assert.equal(d.outcome ?? null, null, 'no job-end: the run is live');
  assert.deepEqual(d.parts.map((p) => p.kind), ['drafting', 'step', 'step'], 'drafting heads the list; the spine\'s own parts follow');
  assert.equal(d.parts[0].spentUsd, DRAFT);
  const live = d.parts.at(-1);
  assert.equal(live.label, 'fix-b', 'the LAST shown part is the live step (what the page marks running)');
  assert.equal(live.outcome ?? null, null, 'the live step has no outcome yet');
  assert.equal(d.parts[1].outcome, 'green');
  assert.deepEqual(d.legDividers ?? [], [], 'one leg, no divider');
  // Audit: every row names a SHOWN index, and that index IS the part the row names
  const rows = getRunAudit('live1', { home }).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.partIndex), [1, 2], 'a (leg 1, fix-a) is shown part 1; b (the live step) is shown part 2 — the drafting part shifted both');
  for (const r of rows) assert.ok(r.partLabel.startsWith(d.parts[r.partIndex].label), `detail.parts[${r.partIndex}] IS the part the row names (${r.partLabel})`);
  // rounds: 0 is the drafting part (no table); the shown index of the live step serves the live step's rounds
  assert.equal(getRunRounds('live1', { part: 0, attempt: 1 }, { home }), null);
  const r2 = getRunRounds('live1', { part: 2, attempt: 1 }, { home });
  assert.ok(r2, 'the live step\'s rounds are served at its SHOWN index');
  assert.equal(r2.step, 'fix-b');
  assert.equal(r2.part, 2);
  assert.equal(getRunRounds('live1', { part: 3, attempt: 1 }, { home }), null, 'one past the end');
});
