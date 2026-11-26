// F399 parity pins, Run tab (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Run tab"). Each test pins what the Run tab shows
// about a run's checks/output against the RECORD (a plain scan in tests/f399-raw.mjs), through the view that reads src/runread.js.
// Fixtures: trimmed REAL spines (tests/fixtures/f399, audit-grid); where no real run has the case, a real spine plus ONE planted record (said in the test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRunDetail, checksLineOf, checkReusedOf } from '../src/panel/server.js';
import { f399World } from './f399-world.mjs';
import { makeAuditGridWorld, RUNID as GRID } from './audit-grid-world.mjs';
import { world, spineAt, specAt, rawClose } from './f399-raw.mjs';

const line = (/** @type {any} */ c, /** @type {any} */ spec) => {
  const declared = (spec.closeDecl.stages ?? []).map((/** @type {any} */ s) => s.name);
  const passed = c.stages.filter((/** @type {any} */ s) => s.verdict === 'satisfied').length;
  const notReached = declared.filter((/** @type {string} */ n) => !c.stages.some((/** @type {any} */ s) => s.name === n)).length;
  return `${c.stages.length} run · ${passed} passed · ${c.stages.length - passed} failed${notReached ? ` · ${notReached} not reached` : ''}`;
};

test('run-checks-line-reads-checksOf: the summary row is the final close\'s stage counts (real runs mv5e1ktb green, the already-green leg of mvtatlxw)', () => {
  const a = f399World('mv5e1ktb', 'rubric-2');
  const specA = specAt('f399/mv5e1ktb/resolved-spec.json');
  assert.equal(getRunDetail('mv5e1ktb', a.opts).checksLine, line(rawClose(spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl')), specA));
  const g = makeAuditGridWorld();
  // leg 2 went already-green: its final close is its own close-precheck (8 stages), never leg 1's red close
  assert.equal(getRunDetail(GRID, g.opts).checksLine, line(rawClose(spineAt('audit-grid/u-mvtatlxw.jsonl')), specAt('audit-grid/mvtatlxw.resolved-spec.json')));
  assert.equal(getRunDetail(GRID, g.opts).checksLine, '8 run · 8 passed · 0 failed');
});

test('run-checks-line-reads-checksOf (red + not reached): golden = today\'s words on the real red run mv73swnx; a planted first-red close names the stages it never reached', () => {
  const w = f399World('mv73swnx', 'flights1');
  assert.equal(getRunDetail('mv73swnx', w.opts).checksLine, '2 run · 1 passed · 1 failed');
  assert.equal(getRunDetail('mwtf8p8s', f399World('mwtf8p8s', 'walk-stop').opts).checksLine, 'not recorded');
  // a real spine (mv5e1ktb) whose final close is replaced by a planted close of ONE red stage out of the 3 the spec declares
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  const spec = specAt('f399/mv5e1ktb/resolved-spec.json');
  const first = spec.closeDecl.stages[0].name;
  const planted = recs.map((r) => (r.type === 'outer-close' ? { ...r, verdict: 'needs_revision', stages: [{ name: first, verdict: 'needs_revision' }] } : r));
  assert.equal(checksLineOf(planted, spec), `1 run · 0 passed · 1 failed · ${spec.closeDecl.stages.length - 1} not reached`);
});

test('run-checks-not-run-again-line: the "Checks not run again" line is the CURRENT leg\'s check-reused text, retired by a later test run (planted records on a real leg)', () => {
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  const text = 'same files as the last check at 2026-11-20T10:00:00Z';
  const at = recs.findIndex((r) => r.type === 'plan-accepted');
  const planted = [...recs.slice(0, at), { type: 'check-reused', text }, ...recs.slice(at)];
  assert.equal(checkReusedOf(planted), text);
  // the detail's `nowReused` calls this same owner but only while the run is live, so the owner itself is pinned
  // a check-start after the accepted plan is a later pass: it retires the line
  const later = [...planted.slice(0, planted.findIndex((r) => r.type === 'plan-accepted') + 1), { type: 'check-start', name: 'x' }, ...planted.slice(planted.findIndex((r) => r.type === 'plan-accepted') + 1)];
  assert.equal(checkReusedOf(later), null);
});

test('ended-not-delivered-reads-outputOf: a green run whose destination refused ends "goal met — not delivered" (real mv5e1ktb + one planted destination-refused)', () => {
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl').filter((r) => r.type !== 'destination-written');
  const planted = [...recs, { type: 'destination-refused', code: 'x', detail: 'the folder is not writable' }];
  const w = world({ id: 'rt2', job: 'j', records: planted, spec: specAt('f399/mv5e1ktb/resolved-spec.json') });
  const d = getRunDetail('rt2', w.opts);
  assert.equal(d.ended.line, 'goal met — not delivered');
  assert.equal(d.ended.reason, 'Goal met, but the output could not be delivered.');
  // without the refusal the same spine ends plainly
  const plain = world({ id: 'rt3', job: 'j', records: recs, spec: specAt('f399/mv5e1ktb/resolved-spec.json') });
  assert.equal(getRunDetail('rt3', plain.opts).ended.line, 'goal met');
});

test('run-delivered-list-reads-outputOf: the Run tab\'s delivered list is the destination-written records (path, bytes, sha256), in order (real run mv5e1ktb)', () => {
  const w = f399World('mv5e1ktb', 'rubric-2');
  const want = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl').filter((r) => r.type === 'destination-written').map((r) => ({ path: r.path, bytes: r.bytes, sha256: r.sha256 }));
  assert.equal(want.length, 2);
  assert.deepEqual(getRunDetail('mv5e1ktb', w.opts).delivered, want);
});

test('ended-worktree-reads-outputOf: a green worktree run\'s NEXT names the work branch from the work-branch/work-committed record (real mv5e1ktb + planted source.json worktree)', () => {
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  const branch = recs.find((r) => r.type === 'work-branch').branch;
  const w = world({ id: 'rt4', job: 'j', records: recs, spec: specAt('f399/mv5e1ktb/resolved-spec.json'), source: { kind: 'repo', worktree: '/nowhere/wt', repo: '/nowhere/repo' } });
  const d = getRunDetail('rt4', w.opts);
  assert.ok(d.ended.rows.some((/** @type {string[]} */ r) => r[0] === 'keep the work:' && r[1] === `git merge ${branch}`), JSON.stringify(d.ended.rows));
  assert.ok(d.ended.rows.some((/** @type {string[]} */ r) => r[0] === 'throw it away:' && r[1] === `git branch -D ${branch}`));
  // a later work-committed record (the branch the final commit landed on) is the one named
  const moved = world({ id: 'rt5', job: 'j', records: [...recs.slice(0, -1), { type: 'work-committed', branch: 'bareloop-moved', commit: 'abc1234', folderKept: false }, recs.at(-1)], spec: specAt('f399/mv5e1ktb/resolved-spec.json'), source: { kind: 'repo', worktree: '/nowhere/wt', repo: '/nowhere/repo' } });
  assert.ok(getRunDetail('rt5', moved.opts).ended.rows.some((/** @type {string[]} */ r) => r[1] === 'git merge bareloop-moved'));
});

test('run-accept-waiting-tag: a review door with no honoured decision is waiting; an honoured accept (or one past the 60-day TTL) is not (real mv5e1ktb door, injected clock)', async () => {
  const { doorWaiting } = await import('../src/reviewdoor.js');
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  const door = recs.find((r) => r.type === 'review-door');
  const doorMs = Date.parse(door.ts);
  const soon = () => doorMs + 86_400_000;
  const open = recs.filter((r) => r.type !== 'door-decision');
  assert.equal(doorWaiting(open, { now: soon }), true);
  assert.equal(doorWaiting(recs, { now: soon }), false, 'the real run recorded an honoured accept');
  assert.equal(doorWaiting(open, { now: () => doorMs + 61 * 86_400_000 }), false, 'past the TTL the door is closed');
});
