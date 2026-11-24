// hamr 2026-11-24, walk run mwuxqx4f (F397): ONE owner of "what is true of the run's CURRENT leg" - src/legs.js `currentLegView`.
// While leg 2..6 ran, the Run tab said "ended <the previous leg's end>", the summary "why" was the previous leg's Stop reason, and
// "Checks not run again" stayed after a later test run began. The spines below are the REAL walk run and a real two-leg provider-red run
// (tests/fixtures/currentleg, copied unedited; no secret-shaped text in them). Every cut is a spine as it stood at that record.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentLegView, legsOf } from '../src/legs.js';
import { replayRun } from '../src/replay.js';
import { getRunDetail, checkReusedOf } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (/** @type {string} */ f) => readFileSync(join(HERE, 'fixtures', 'currentleg', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const WALK = load('u-mwuxqx4f.jsonl'); // 612 records, 6 legs (a leg-resume at records 116, 184, 310, 489, 543)
const PROV = load('u-mwezqp5w.jsonl'); // 2 legs, the first ended provider-red

/** the independent truth for the first `n` records: counted by hand from the markers, never through legsOf */
function truth(/** @type {any[]} */ all, /** @type {number} */ n) {
  const prefix = all.slice(0, n);
  let start = 0; let leg = 1; let prevStart = -1;
  prefix.forEach((r, i) => { if (r.type === 'leg-resume' && i > 0) { prevStart = start; start = i; leg += 1; } });
  const inLeg = prefix.slice(start);
  const je = inLeg.filter((r) => r.type === 'job-end').at(-1) ?? null;
  const esc = inLeg.filter((r) => r.type === 'escalation').at(-1) ?? null;
  const prevLeg = prevStart >= 0 || leg > 1 ? prefix.slice(prevStart < 0 ? 0 : prevStart, start) : null;
  const prevEnd = prevLeg ? prevLeg.filter((r) => r.type === 'job-end').at(-1) ?? null : null;
  return { leg, endedTs: je?.ts ?? null, outcome: je?.outcome ?? null, esc: esc?.category ?? null, prevEnd: prevEnd ? { endedTs: prevEnd.ts, outcome: prevEnd.outcome } : null, moneyHalt: inLeg.some((r) => r.type === 'money-halt') };
}

test('the owner is right on EVERY cut of the walk spine and of the two-leg provider-red spine', () => {
  for (const [label, all] of [['walk', WALK], ['provider-red', PROV]]) {
    for (let n = 1; n <= all.length; n += 1) {
      const t = truth(all, n);
      const v = currentLegView(all.slice(0, n));
      assert.equal(v.legIndex, t.leg, `${label}@${n} leg`);
      assert.equal(v.endedTs, t.endedTs, `${label}@${n} endedTs`);
      assert.equal(v.outcome, t.outcome, `${label}@${n} outcome (job-end only)`);
      assert.equal(v.live, t.endedTs === null, `${label}@${n} live`);
      assert.equal(v.lastEscalation?.category ?? null, t.esc, `${label}@${n} lastEscalation is this leg's own`);
      assert.equal(v.moneyHalt, t.moneyHalt, `${label}@${n} moneyHalt`);
      assert.deepEqual(v.previous === null ? null : { endedTs: v.previous.endedTs, outcome: v.previous.outcome }, t.prevEnd === null && t.leg > 1 ? { endedTs: null, outcome: null } : t.prevEnd, `${label}@${n} previous leg`);
    }
  }
  assert.equal(currentLegView([]), null);
});

test('Leg.outcome: a LIVE leg never reads an outcome from run-end (the walk spine at records 107 and 472 said green)', () => {
  // run-end is written after every ralph pass inside a running leg: record 72 green, 470 green
  assert.equal(WALK[71].type, 'run-end');
  assert.equal(WALK[469].type, 'run-end');
  for (const n of [107, 472]) assert.equal(legsOf(WALK.slice(0, n)).at(-1).outcome, null, `cut ${n}`);
  // and on EVERY cut of both spines a leg with no job-end reads null
  for (const all of [WALK, PROV]) {
    for (let n = 1; n <= all.length; n += 1) {
      const last = legsOf(all.slice(0, n)).at(-1);
      if (last.jobEnd === null) assert.equal(last.outcome, null, `cut ${n}`);
      else assert.equal(last.outcome, last.jobEnd.outcome);
    }
  }
});

test('Leg.outcome: a $0 refusal (run-end written before runJob wrote any job-start) still reads its run-end', () => {
  // the exact shape src/userrun.js emits for a destination / source refusal: `destination-refused` then `run-end`, no job-start, no job-end
  const refused = [{ type: 'destination-refused', code: 'x', detail: 'no', ts: '2026-11-24T10:00:00.000Z', seq: 1 }, { type: 'run-end', outcome: 'escalated', ts: '2026-11-24T10:00:00.010Z', seq: 2 }];
  assert.equal(legsOf(refused).at(-1).outcome, 'escalated');
  assert.equal(currentLegView(refused).outcome, null, 'the view reads job-end only');
  assert.equal(currentLegView(refused).live, true);
});

test('a leg that follows a stopped leg has no end time, stop reason or escalation of its own yet (legs 2 and 3, from the resume on)', () => {
  const sum = (/** @type {number} */ n) => replayRun(WALK.slice(0, n), [], { runId: 'x', auditAvailable: false });
  assert.match(sum(115).stopReason, /stopped/, 'the ended leg 1 carries its own reason');
  for (const n of [116, 117, 130, 150, 172, 177]) {
    assert.equal(sum(n).stopReason, null, `leg 2 @${n}: no stop reason while it runs`);
    assert.equal(sum(n).lastEscalation, null);
  }
  assert.match(sum(183).stopReason, /stopped/, 'leg 2 ended: its own reason');
  assert.equal(sum(184).stopReason, null);
  assert.match(sum(309).stopReason, /Budget gate|cap/i);
  assert.equal(sum(310).stopReason, null, 'leg 4 just resumed after a cap-halt');
});

test('reused: shown through the start pass (its own check-starts, the plan), retired by the first check-start of a LATER pass', () => {
  const shown = (/** @type {number} */ n) => currentLegView(WALK.slice(0, n)).reused;
  const T1 = 'Checks not run again: same files as the last check at 17:42.';
  // leg 1: check-reused is record 13; the start pass's own check-starts are 15..23; plan-accepted 52; the first test run after the plan is check-start 107
  assert.equal(WALK[12].type, 'check-reused'); assert.equal(WALK[106].type, 'check-start'); assert.equal(WALK[51].type, 'plan-accepted');
  assert.equal(shown(12), null);
  for (const n of [13, 15, 23, 24, 52, 55, 76, 106]) assert.equal(shown(n), T1, `leg 1 @${n}`);
  assert.equal(shown(107), null, 'the first check-start after the plan retires it');
  assert.equal(shown(110), null);
  // leg 2: check-reused 130, start-pass check-starts 132..140, plan 145, check-start 172 retires
  assert.equal(WALK[129].type, 'check-reused'); assert.equal(WALK[171].type, 'check-start');
  for (const n of [116, 129]) assert.equal(shown(n), null, `leg 2 @${n} before its own line: the earlier leg's is not shown`);
  for (const n of [130, 132, 140, 145, 150, 171]) assert.equal(shown(n), T1, `leg 2 @${n}`);
  assert.equal(shown(172), null);
  // leg 3 took no saved result: never a line
  for (let n = 184; n <= 309; n += 1) assert.equal(shown(n), null, `leg 3 @${n}`);
  // leg 4 (line at 18:27) shown through its start pass and plan (339) and the AI's turns, retired at check-start 377
  const T4 = 'Checks not run again: same files as the last check at 18:27.';
  assert.equal(WALK[319].type, 'check-reused'); assert.equal(WALK[376].type, 'check-start');
  for (const n of [320, 322, 334, 339, 344, 376]) assert.equal(shown(n), T4, `leg 4 @${n}`);
  assert.equal(shown(377), null);
  // leg 5: line 499, start-pass check-starts 501..513, plan 518, then a real run of the tests at 521 retires it
  const T5 = 'Checks not run again: same files as the last check at 20:38.';
  assert.equal(WALK[498].type, 'check-reused'); assert.equal(WALK[520].type, 'check-start');
  for (const n of [499, 501, 513, 518, 520]) assert.equal(shown(n), T5, `leg 5 @${n}`);
  assert.equal(shown(521), null);
  assert.equal(shown(542), null);
  // leg 6 likewise (553 .. 575), and the finished run shows none
  for (const n of [553, 567, 572, 574]) assert.equal(shown(n), 'Checks not run again: same files as the last check at 20:51.', `leg 6 @${n}`);
  assert.equal(shown(575), null);
  assert.equal(shown(WALK.length), null);
  // the panel's own reader is the owner's
  assert.equal(checkReusedOf(WALK.slice(0, 150)), T1);
  assert.equal(checkReusedOf(WALK.slice(0, 172)), null);
});

// ---- the panel's own outputs, at the same cuts -------------------------------------------------------------------------------------------------
/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
let k = 0;
function detailAt(/** @type {any[]} */ all, /** @type {number} */ n) {
  const recs = all.slice(0, n);
  const home = mkdtempSync(join(tmpdir(), 'legcur-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const spine = join(dir, 'u-cur.jsonl');
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  k += 1;
  appendRun({ at: recs[0].ts, runid: `lcv${k}`, job: 'job', spine, patient: null, via: 'run-u', capUsd: 8 }, { home });
  return getRunDetail(`lcv${k}`, { home, now: Date.parse(recs.at(-1).ts) + 1000 });
}

test('Run tab header: "ended" is this leg\'s own, null while the next leg runs (walk legs 2-6 at their first records)', () => {
  const ended = detailAt(WALK, 115);
  assert.equal(ended.endedAt, '2026-11-24T16:58:18.577Z');
  assert.equal(ended.outcome, 'stopped');
  assert.match(ended.endedText, /stopped/);
  for (const n of [116, 117, 130, 150, 172, 177]) {
    const d = detailAt(WALK, n);
    assert.equal(d.endedAt, null, `@${n} endedAt`);
    assert.equal(d.endedText, null, `@${n} endedText`);
    assert.equal(d.outcome, null);
    assert.equal(d.status.word, 'running', `@${n}`);
    assert.ok(!d.stopReason, `@${n}: the previous leg's Stop reason is not this leg's`);
  }
  assert.equal(detailAt(WALK, 310).endedAt, null, 'leg 4 after the cap-halt');
  assert.equal(detailAt(WALK, 543).endedAt, null, 'leg 6 after the provider-red');
  const final = detailAt(WALK, WALK.length);
  assert.equal(final.endedAt, '2026-11-24T21:12:59.471Z');
  assert.equal(final.status.word, 'passed');
});

test('Run tab NOW row: the reused line shows through the start pass and AI turns, and is gone once the tests run again in the same leg', () => {
  const T1 = 'Checks not run again: same files as the last check at 17:42.';
  assert.equal(detailAt(WALK, 150).nowReused, T1);
  assert.match(detailAt(WALK, 150).now, /AI working/);
  const d = detailAt(WALK, 172);
  assert.match(d.now, /Running your tests/);
  assert.equal(d.nowReused, null, 'a new test run began in this leg: the old line must not stay');
  assert.equal(detailAt(WALK, 521).nowReused, null);
  assert.match(detailAt(WALK, 521).now, /Running your tests/);
});

test('the provider-red spine: leg 2 just resumed has no end and no reason; leg 1 keeps its own', () => {
  const at = PROV.findIndex((r, i) => i > 0 && r.type === 'leg-resume');
  assert.ok(at > 0);
  const before = detailAt(PROV, at);
  assert.equal(before.outcome, 'provider-red');
  assert.ok(before.endedAt);
  const after1 = detailAt(PROV, at + 1);
  assert.equal(after1.endedAt, null);
  assert.equal(after1.outcome, null);
  assert.ok(!after1.stopReason);
});
