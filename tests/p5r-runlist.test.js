// P5-R — the run list and the monthly limit for a ONE-FILE, MULTI-LEG run: one row, a `leg-start` per resume,
// settled/released per leg, the hold taken per leg; money counts every leg once, wall excludes the gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRun, appendRunEvent, appendLegStart, readRunList, isSettled } from '../src/runlist.js';
import { readLegs, monthSpend, checkMonthlyRoom, legWall, settleDeadClaims, claimRun } from '../src/monthly.js';
import { floorsFromRecords } from '../src/ledger.js';
import { updateConfig } from '../src/config.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'p5r-runlist-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const NOW = new Date(2026, 9, 3, 12, 0, 0); // 3 Oct 2026, local noon
const iso = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0).toISOString();
const DEAD_PID = 999999;

/** a spine written to disk: leg 1 cap-halts after $3 (10:00-10:20), leg 2 resumes at 14:00 and spends $2 (to 14:10) */
function twoLegSpine(dir, { day = NOW, leg2Day = day, leg2End = true } = {}) {
  const spine = join(dir, 'u-r1.jsonl');
  const recs = [
    { type: 'job-start', job: 'j', budgetUsd: 8, ts: iso(day, 10, 0), seq: 1 },
    { type: 'worker-round', kind: 'turn', costUsd: 3, ts: iso(day, 10, 5), seq: 2 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 3, engagementSpentUsd: 3, spendComplete: true, ts: iso(day, 10, 20), seq: 3 },
    { type: 'leg-resume', leg: 2, after: 'cap-halt', ts: iso(leg2Day, 14, 0), seq: 4 },
    { type: 'job-start', job: 'j', budgetUsd: 8, priorSpentUsd: 3, ts: iso(leg2Day, 14, 0), seq: 5 },
    { type: 'worker-round', kind: 'turn', costUsd: 2, ts: iso(leg2Day, 14, 5), seq: 6 },
    ...(leg2End ? [{ type: 'job-end', outcome: 'green', spentUsd: 5, engagementSpentUsd: 2, spendComplete: true, ts: iso(leg2Day, 14, 10), seq: 7 }] : []),
  ];
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return spine;
}

test('P5-R run list: leg-start folds into the ONE row (latest leg\'s pid/cap), and the row is positioned at its latest claim', (t) => {
  const home = tmp(t);
  appendRun({ at: iso(NOW, 10), runid: 'r1', job: 'j', spine: '/s/r1', patient: null, via: 'run-u', pid: 100, capUsd: 8 }, { home });
  appendRun({ at: iso(NOW, 11), runid: 'other', job: 'j', spine: '/s/other', patient: null, via: 'run-u', pid: 200, capUsd: 1 }, { home });
  appendLegStart({ type: 'leg-start', runid: 'r1', leg: 2, pid: 300, capUsd: 5, at: iso(NOW, 14) }, { home });
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 2, 'one row per run — never a second row for the resume');
  assert.deepEqual(rows.map((r) => r.runid), ['other', 'r1'], 'file order is claim order: r1\'s LATEST claim is below other\'s');
  const r1 = rows.find((r) => r.runid === 'r1');
  assert.equal(r1.leg, 2);
  assert.equal(r1.pid, 300);
  assert.equal(r1.capUsd, 5);
  assert.equal(rows.find((r) => r.runid === 'other').leg, undefined, 'a never-resumed row is byte-for-byte as it always was');
});

test('P5-R run list: settled/released are per leg — a leg-2 release gives back that leg and never removes the run; a leg-1 release still does', (t) => {
  const home = tmp(t);
  appendRun({ at: iso(NOW, 10), runid: 'r1', job: 'j', spine: '/s/r1', patient: null, via: 'run-u', pid: 100, capUsd: 8 }, { home });
  appendLegStart({ type: 'leg-start', runid: 'r1', leg: 2, pid: 300, capUsd: 5, at: iso(NOW, 14) }, { home });
  appendRunEvent({ runid: 'r1', type: 'released', by: 'r1', reason: 'refused', at: iso(NOW, 14), leg: 2 }, { home });
  let { rows } = readRunList({ home });
  assert.equal(rows.length, 1, 'the run stays listed');
  assert.equal(rows[0].leg, undefined, 'the voided leg-2 claim does not move the row');
  assert.equal(rows[0].pid, 100, 'the row falls back to the last leg that really started');
  appendRunEvent({ runid: 'r1', type: 'settled', by: 'r1', spentUsd: 3, at: iso(NOW, 15) }, { home });
  const r = readRunList({ home });
  assert.equal(isSettled(r.events, { runid: 'r1' }), true);
  assert.equal(isSettled(r.events, { runid: 'r1', leg: 2 }), false, 'leg 1\'s settle is not leg 2\'s');
  appendRun({ at: iso(NOW, 9), runid: 'gone', job: 'j', spine: '/s/gone', patient: null, via: 'run-u', pid: 1 }, { home });
  appendRunEvent({ runid: 'gone', type: 'released', by: 'gone', reason: 'not started', at: iso(NOW, 9) }, { home });
  ({ rows } = readRunList({ home }));
  assert.deepEqual(rows.map((x) => x.runid), ['r1'], 'a leg-1 release is a run that never started: not listed');
});

test('P5-R monthly: a two-leg run counts leg 1 ONCE and leg 2 once (the declared fold is never added on top), and its wall excludes the gap', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const spine = twoLegSpine(d);
  appendRun({ at: iso(NOW, 10), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u', pid: DEAD_PID, capUsd: 8 }, { home });
  appendLegStart({ type: 'leg-start', runid: 'r1', leg: 2, pid: DEAD_PID, capUsd: 5, at: iso(NOW, 14) }, { home });
  const m = monthSpend({ home, now: () => NOW.getTime() });
  assert.equal(m.usd, 5, '$3 (leg 1) + $2 (leg 2) = $5 — not $3 + $5 (leg 2\'s terminal carries leg 1 too)');
  assert.equal(m.atLeast, false);
  const legs = readLegs({ home, now: () => NOW.getTime() });
  assert.equal(legs.length, 2, 'each leg is its own figure, on its own date');
  assert.deepEqual(legs.map((l) => l.usd), [3, 2]);
  const wall = legWall(legsFromSpine(spine));
  assert.equal(wall.ms, 30 * 60_000, '20min + 10min of working time; the 3h40 between the legs is nobody\'s');
  assert.equal(wall.complete, true);
});

test('P5-R monthly: a leg resumed in a LATER month counts in that month — never folded back into the month the run began in', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const sep = new Date(2026, 8, 28, 12);
  const spine = twoLegSpine(d, { day: sep, leg2Day: NOW });
  appendRun({ at: iso(sep, 10), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u', pid: DEAD_PID, capUsd: 8 }, { home });
  appendLegStart({ type: 'leg-start', runid: 'r1', leg: 2, pid: DEAD_PID, capUsd: 5, at: iso(NOW, 14) }, { home });
  assert.equal(monthSpend({ home, now: () => NOW.getTime() }).usd, 2, 'October holds only leg 2\'s $2');
  assert.equal(monthSpend({ home, now: () => new Date(2026, 8, 30).getTime() }).usd, 3, 'and September\'s own figure is leg 1\'s $3');
});

test('P5-R monthly hold: only the LATEST leg is held (at its cap); an earlier leg of the same run is spent money, not a hold', (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 20 }, { home });
  const d = tmp(t);
  const spine = twoLegSpine(d, { leg2End: false });
  // a live runner: this very test process (a node process; pid is alive and, with no /proc cmdline match, may read as a runner or not)
  appendRun({ at: iso(NOW, 10), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u', pid: process.pid, capUsd: 8 }, { home });
  appendLegStart({ type: 'leg-start', runid: 'r1', leg: 2, pid: process.pid, capUsd: 5, at: iso(NOW, 14) }, { home });
  const legs = readLegs({ home, now: () => NOW.getTime() });
  assert.equal(legs.length, 2);
  assert.equal(legs[0].reservedUsd, legs[0].usd, 'leg 1 is spent money, never held at its cap');
  assert.ok(legs[1].reservedUsd >= legs[1].usd, 'the latest leg holds its claim when its runner is alive (or reads its spend when /proc says it is not a runner)');
});

test('P5-R monthly claim: a resumed leg\'s own check counts its EARLIER legs\' spend and not its own claim; a refusal gives back that leg only', (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 6 }, { home });
  const d = tmp(t);
  const spine = twoLegSpine(d, { leg2End: false });
  appendRun({ at: iso(NOW, 10), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u', pid: DEAD_PID, capUsd: 8 }, { home });
  // leg 2 claims $5 with $6 of limit and $3 (leg 1) + $2 (leg 2 so far, same file) already spent: refused
  const row = { at: iso(NOW, 14), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u', pid: process.pid, capUsd: 5 };
  const got = claimRun({ row, capUsd: 5, home, now: () => NOW.getTime(), leg: 2 });
  assert.equal(got.claimed, false);
  assert.equal(got.room.ok, false);
  const { rows, events } = readRunList({ home });
  assert.equal(rows.length, 1, 'the run stays');
  assert.ok(events.some((e) => e.type === 'released' && e.leg === 2), 'leg 2\'s claim is given back, tagged with its leg');
  assert.equal(rows[0].leg, undefined);
});

test('P5-R settleDeadClaims closes a dead LATEST leg, tagged with its leg, and never the run\'s own claim', (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 50 }, { home });
  const d = tmp(t);
  const spine = twoLegSpine(d, { leg2End: false });
  appendRun({ at: iso(NOW, 10), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u', pid: DEAD_PID, capUsd: 8 }, { home });
  appendLegStart({ type: 'leg-start', runid: 'r1', leg: 2, pid: DEAD_PID, capUsd: 5, at: iso(NOW, 14) }, { home });
  appendRun({ at: iso(NOW, 15), runid: 'next', job: 'j', spine: join(d, 'u-next.jsonl'), patient: null, via: 'run-u', pid: process.pid, capUsd: 1 }, { home });
  const n = settleDeadClaims({ home, by: 'next', aboveRunid: 'next' });
  assert.equal(n, 1);
  const { events, rows } = readRunList({ home });
  const settled = events.find((e) => e.type === 'settled' && e.runid === 'r1');
  assert.equal(settled.leg, 2);
  assert.equal(settled.spentUsd, 2, 'the leg\'s own floor, not the chain');
  assert.equal(isSettled(events, rows.find((r) => r.runid === 'r1')), true);
});

test('P5-R ledger floors: the wall floor is the sum of each leg\'s own window; one leg reads as it always did', () => {
  const a = (h, m) => iso(NOW, h, m);
  const one = [{ type: 'job-start', ts: a(10, 0) }, { type: 'worker-round', costUsd: 1, ts: a(10, 30) }];
  assert.equal(floorsFromRecords(one).wallFloorMs, 30 * 60_000);
  const two = [...one, { type: 'leg-resume', ts: a(14, 0) }, { type: 'worker-round', costUsd: 2, ts: a(14, 15) }];
  const f = floorsFromRecords(two);
  assert.equal(f.wallFloorMs, 45 * 60_000, '30min + 15min, not 4h15');
  assert.equal(f.spendFloorUsd, 3, 'rounds are summed once across the file');
});

function legsFromSpine(spine) {
  return readFileSync(spine, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}
