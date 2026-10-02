// P5-R — the panel's readers on a ONE-FILE, MULTI-LEG run: one row (one card), the latest leg's state, money
// counted once, wall without the gap, resume #2 under the LATEST signed caps, and the tool log scoped per leg
// across its two homes (the finished legs' file + the live leg's file in the patient tree).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getRunDetail, listRuns, getRunAudit, resumePlanFor, legDividersFor, formatTimestamp,
} from '../src/panel/server.js';
import { appendRun, appendLegStart, readRunList } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'p5r-panel-'));
  tmpDirs.push(d);
  return d;
}

const SPEC1 = { job: 'fix-types', description: 'p5r fixture', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'make types clean' };
const SPEC2 = { ...SPEC1, budgetUsd: 12 }; // the caps leg 2 ran under (raised and re-signed)
const MIN = 60_000;
const at = (h, m) => `2026-10-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

/** a panel-authored run on disk with TWO legs: leg 1 10:00-10:20 spends $3 and cap-halts; leg 2 14:00-14:10 spends $2.
 * `leg2`: 'died' (no terminal, runner gone) | 'green' | 'cap-halt' */
function makeTwoLeg(home, { leg2 = 'died', runid = 'run1', livePatient = false } = {}) {
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, `${SPEC1.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(SPEC1));
  writeFileSync(join(out, 'resolved-spec-r1.json'), JSON.stringify(SPEC2));
  const plan = { schema: 'plan-v1', steps: [{ id: 'fix-types' }] };
  const records = [
    { type: 'job-start', job: SPEC1.job, specHash: jobSpecHash(SPEC1), budgetUsd: 8, shape: 'plan', goal: SPEC1.goal, ts: at(10, 0), seq: 1 },
    { type: 'plan-accepted', plan, ts: at(10, 1), seq: 2 },
    { type: 'step-start', step: 'fix-types', ts: at(10, 3), seq: 2.5 },
    { type: 'worker-round', kind: 'turn', costUsd: 3, phase: 'step:fix-types', ts: at(10, 5), seq: 3 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 3, engagementSpentUsd: 3, spendComplete: true, ts: at(10, 20), seq: 4 },
    { type: 'leg-resume', leg: 2, after: 'cap-halt', at: at(14, 0), ts: at(14, 0), seq: 5 },
    {
      type: 'job-start', job: SPEC1.job, specHash: jobSpecHash(SPEC2), budgetUsd: 12, shape: 'plan', goal: SPEC1.goal, priorSpentUsd: 3, priorSpendComplete: true, priorWallMs: 20 * MIN, ts: at(14, 0), seq: 6,
    },
    { type: 'plan-accepted', plan, ts: at(14, 1), seq: 7 },
    { type: 'step-start', step: 'fix-types', ts: at(14, 2), seq: 7.5 },
    { type: 'worker-round', kind: 'turn', costUsd: 2, phase: 'step:fix-types', ts: at(14, 5), seq: 8 },
    ...(leg2 === 'died' ? [{ type: 'worker-round', kind: 'turn', costUsd: 0, ts: at(14, 10), seq: 9 }] : []),
    ...(leg2 === 'green' ? [{ type: 'job-end', outcome: 'green', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: at(14, 10), seq: 9 }] : []),
    ...(leg2 === 'cap-halt' ? [{ type: 'job-end', outcome: 'cap-halt', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: at(14, 10), seq: 9 }] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  const patient = livePatient ? tmp() : null;
  appendRun({ at: at(10, 0), runid, job: SPEC1.job, spine, patient, via: 'run-u', pid: 999999, capUsd: 8 }, { home });
  appendLegStart({ type: 'leg-start', runid, leg: 2, pid: 999999, capUsd: 9, at: at(14, 0) }, { home });
  return { out, spine, patient, dir };
}

test('P5-R panel: ONE card for a resumed run — latest leg\'s state, money counted once, wall without the gap, resumed ×1', (t) => {
  const home = tmp();
  makeTwoLeg(home, { leg2: 'green' });
  const runs = listRuns({ home });
  assert.equal(runs.length, 1, 'one card, never two');
  const r = runs[0];
  assert.equal(r.runid, 'run1');
  assert.equal(r.glyph, '✓', 'the LAST leg\'s outcome (green), not leg 1\'s cap-halt');
  assert.equal(r.resumedCount, 1);
  assert.equal(r.spentUsd, 5, '$3 + $2 — leg 1 counted once');
  assert.equal(r.budgetUsd, 12, 'the caps the latest leg ran under');
  assert.equal(r.wall, '30m00s', '20min + 10min of working time; the 3h40 gap is excluded');
  const d = getRunDetail('run1', { home });
  assert.equal(d.outcome, 'green');
  assert.equal(d.spentUsd, 5);
  assert.equal(d.wallMs, 30 * MIN);
  assert.equal(d.resumedCount, 1);
  assert.deepEqual(d.legs.map((l) => [l.leg, l.after, l.outcome]), [[1, null, 'cap-halt'], [2, 'cap-halt', 'green']]);
});

test('P5-R panel: a run whose LATEST leg died is [?] died with floors from BOTH legs (spend once, wall without the gap) — not leg 1\'s cap-halt', () => {
  const home = tmp();
  makeTwoLeg(home, { leg2: 'died' });
  const r = listRuns({ home })[0];
  assert.equal(r.glyph, '?');
  assert.equal(r.died, true);
  assert.equal(r.spendFloorUsd, 5, 'rounds summed across the file: $3 + $2');
  assert.equal(r.wallFloorMs, 30 * MIN, 'sum of the legs\' first->last windows (20min + 10min)');
  assert.equal(r.resumedCount, 1);
  const d = getRunDetail('run1', { home });
  assert.equal(d.died, true);
  assert.equal(d.ended.actions.some((a) => a.id === 'resume'), true, 'a died latest leg is resumable again');
});

test('P5-R panel: resume #2 is offered under the LATEST signed caps (the spec file whose hash the latest leg ran under)', () => {
  const home = tmp();
  const { spine } = makeTwoLeg(home, { leg2: 'cap-halt' });
  const row = readRunList({ home }).rows[0];
  const plan = resumePlanFor(row, readFileSync(spine, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  assert.equal(plan.ok, true, plan.why);
  assert.equal(plan.specHash, jobSpecHash(SPEC2), 'the latest leg\'s hash, never leg 1\'s');
  assert.equal(plan.budgetUsd, 12);
  assert.equal(plan.spentUsd, 5, 'the whole run\'s spend once: the leg\'s declared $3 + its own $2');
  assert.equal(plan.wallUsedMs, 30 * MIN, 'wall used without the gap');
});
test('P5-R panel Audit: the tool log is scoped per leg across BOTH homes (the finished legs\' file + the live leg\'s file); a row in the gap is dropped', () => {
  const home = tmp();
  const { dir, patient } = makeTwoLeg(home, { leg2: 'died', livePatient: true });
  const row = (iso, p) => JSON.stringify({ ts: iso, decision: 'allow', action: { type: 'read', path: p } });
  // leg 1's rows (finished: filed beside the spine) include one written in the gap by an unrelated run
  writeFileSync(join(dir, 'u-run1-gate-audit.jsonl'), `${[row(at(10, 5), '/a'), row(at(12, 0), '/gap')].join('\n')}\n`);
  // leg 2 is still the latest and has no terminal: its rows are in the patient tree
  writeFileSync(join(patient, 'gate-audit.jsonl'), `${row(at(14, 5), '/b')}\n`);
  const a = getRunAudit('run1', { home });
  assert.equal(a.empty, false);
  assert.deepEqual(a.rows.map((r) => r.path), ['/a', '/b'], 'both legs\' rows, the gap row gone');
  assert.equal(a.raw.split('\n').length, 2);
});

test('P5-R panel: parts say which leg they belong to, and the part a leg ENDED at is marked so the map draws a dotted connector to where the next leg picked up', () => {
  const home = tmp();
  makeTwoLeg(home, { leg2: 'green' });
  const d = getRunDetail('run1', { home });
  const steps = d.parts.filter((p) => p.kind === 'step');
  assert.deepEqual(steps.map((p) => p.leg), [1, 2], 'try 1 ran in leg 1, try 2 in leg 2');
  assert.equal(steps[0].resumedNext, true, 'the step leg 1 ended at links to the step leg 2 picked up');
  assert.equal(steps[1].resumedNext, undefined);
  const single = getRunDetail('run1', { home: (() => { const h = tmp(); makeOneLeg(h); return h; })() });
  assert.equal(single.parts.some((p) => p.leg !== undefined || p.resumedNext !== undefined), false, 'a run nobody resumed carries no leg fields');
});

function makeOneLeg(home) {
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, `${SPEC1.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(SPEC1));
  const records = [
    { type: 'job-start', job: SPEC1.job, specHash: jobSpecHash(SPEC1), budgetUsd: 8, shape: 'plan', goal: SPEC1.goal, ts: at(10, 0), seq: 1 },
    { type: 'step-start', step: 'fix-types', ts: at(10, 3), seq: 2 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 3, engagementSpentUsd: 3, spendComplete: true, ts: at(10, 20), seq: 4 },
  ];
  const spine = join(dir, 'u-solo.jsonl');
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at: at(10, 0), runid: 'run1', job: SPEC1.job, spine, patient: null, via: 'run-u', pid: 999999, capUsd: 8 }, { home });
}

test('P5-R panel Audit: a divider between the legs, code-owned text — how the earlier leg ended, the money at that point, when it resumed', () => {
  const home = tmp();
  makeTwoLeg(home, { leg2: 'green' });
  const d = getRunDetail('run1', { home });
  assert.equal(d.legDividers.length, 1);
  const dv = d.legDividers[0];
  assert.equal(dv.leg, 2);
  assert.equal(dv.text, `stopped: money cap reached ($3.00) · resumed ${formatTimestamp(at(14, 0))}`);
  const stepIdx = d.parts.findIndex((p) => p.kind === 'step' && p.leg === 2);
  assert.equal(dv.beforePart, stepIdx, 'the divider sits before the first part of the leg that picked up');
});

test('P5-R legDividersFor: the "after" words are fixed sentences; a leg that has no part yet puts its divider at the end; an unknown ending is shown plainly, never hidden', () => {
  const rec = (after) => [
    { type: 'job-start', ts: at(10, 0), seq: 1 },
    { type: 'job-end', outcome: after === 'died' ? undefined : after, spentUsd: 1, spendComplete: true, ts: at(10, 5), seq: 2 },
    { type: 'leg-resume', leg: 2, after, at: at(12, 0), ts: at(12, 0), seq: 3 },
  ].filter((r) => !(r.type === 'job-end' && after === 'died'));
  const text = (a) => legDividersFor(rec(a), [])[0].text.replace(/ · resumed .*$/, '');
  assert.equal(text('wall-halt'), 'stopped: time cap reached');
  assert.equal(text('provider-red'), 'stopped: the model provider failed');
  assert.equal(text('step-stalled'), 'stopped: a step stopped making progress');
  assert.equal(text('stopped'), 'stopped: you stopped it');
  assert.equal(text('died'), 'stopped: no ending was recorded');
  assert.equal(text('weird-outcome'), 'stopped: weird-outcome');
  assert.equal(legDividersFor(rec('cap-halt'), [{ leg: 1 }])[0].beforePart, 1, 'no part in the new leg yet: the divider closes the list');
});
