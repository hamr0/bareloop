// Cross-run learnings, part 3: the ONE ledger (ITEM33-BUILD.md rev 2, section 5 and the RULED block).
// Cards come from real archived runs; a test that edits a card or a row says so. The disk tests use a scratch home and
// never touch ~/.config/bareloop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emptyLedger, countLedger, cardsMatch, holdPending, releasePending, recordHealth, readableRows, climb, lessonOf, renderHints,
  DECAY_DAYS, PENDING_DAYS, placeOf,
} from '../src/learn.js';
import { readLedger, writeLedger, ledgerPath, foldRunIntoLedger, releaseRun } from '../src/learnstore.js';
import { cardsOf } from './learn-fixtures.js';
import { jobSpecHash, workflowKey } from '../src/job.js';

const DAY = 86_400_000;
const AURORA = ['ms2c0ls7', 'ms7flkok', 'mszi97jd', 'ms2ddxjc', 'mszcfaof'];
const built = new Map(AURORA.map((id) => [id, cardsOf(id)]));
const runAt = (/** @type {string} */ id) => /** @type {string} */ (built.get(id)?.cards[0].at);
const WF = 'aurora-u-spawner-types';
const NOW = new Date(new Date(runAt('mszcfaof')).getTime() + DAY);
const scratch = (/** @type {any} */ t) => { const d = mkdtempSync(join(tmpdir(), 'bareloop-learn-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const fold = (/** @type {any} */ L, /** @type {string} */ id, over = {}) => countLedger(L, {
  runid: id, cards: /** @type {any} */ (built.get(id)).cards, workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: 'deterministic', now: NOW, ...over,
});
const sorted = [...AURORA].sort((a, b) => (runAt(a) < runAt(b) ? -1 : 1));

test('a hint is kept after ONE run (count starts at 1); the same lesson in later runs counts up, newest sample wins', () => {
  let L = fold(emptyLedger(), sorted[0]);
  const tc = () => L.rows.filter((r) => r.sample.check === 'typecheck');
  assert.equal(tc().length, 1);
  assert.equal(tc()[0].count, 1);
  assert.deepEqual(tc()[0].runIds, [sorted[0]]);
  for (const id of sorted.slice(1)) L = fold(L, id);
  assert.equal(tc().length, 1, 'five runs, one lesson, one row');
  assert.equal(tc()[0].count, 5);
  assert.deepEqual(tc()[0].runIds, sorted);
  assert.equal(tc()[0].sample.runid, sorted.at(-1), 'ONE sample: the LATEST card');
  assert.equal(tc()[0].firstSeen, runAt(sorted[0]));
  assert.equal(tc()[0].lastSeen, runAt(sorted.at(-1)));
  assert.equal(tc()[0].lesson, lessonOf(tc()[0].sample));
  assert.match(tc()[0].lesson, /^check "typecheck"( .*)? failed on \[unreachable\] .*; fixed later in the same run\.$/);
  // the no-suppressions lesson of two runs is its own row
  const ns = L.rows.filter((r) => r.sample.check === 'no-suppressions');
  assert.equal(ns.length, 1);
  assert.equal(ns[0].count, 2);
  assert.equal(L.rows.every((r) => r.level === 'workflow' && r.trust === 'deterministic'), true);
});

test('idempotent by run id: folding the same run again changes nothing (a resumed run is one id)', () => {
  let L = emptyLedger();
  for (const id of sorted) L = fold(L, id);
  const again = fold(L, sorted[2]);
  assert.deepEqual(again.rows, L.rows);
});

test('at most +1 per RUN per row: one run with two cards of one lesson counts once', () => {
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  // the record is edited: a second card of the SAME run and lesson (a stuck twin of the fixed one)
  const twin = { ...c, id: `${c.id}-twin`, kind: 'NEVER_FIXED' };
  const L = countLedger(emptyLedger(), { runid: 'ms2c0ls7', cards: [c, twin], workflow: WF, place: null, specHash: null, trust: 'deterministic', now: NOW });
  assert.equal(L.rows.length, 1);
  assert.equal(L.rows[0].count, 1);
  assert.deepEqual(L.rows[0].runIds, ['ms2c0ls7']);
});

test('per-model counts ride along (information only), and NEVER FIXED cards count like fixed ones', () => {
  const a = { .../** @type {any} */ (built.get('ms2c0ls7')).cards[0], model: 'deepseek-flash' };
  const b = { ...a, model: 'sonnet' };
  let L = countLedger(emptyLedger(), { runid: 'r1', cards: [a], workflow: WF, place: null, specHash: null, trust: 'deterministic', now: NOW });
  L = countLedger(L, { runid: 'r2', cards: [b], workflow: WF, place: null, specHash: null, trust: 'deterministic', now: NOW });
  assert.deepEqual(L.rows[0].models, { 'deepseek-flash': 1, sonnet: 1 });
  const [stuck] = cardsOf('mshcpdg4').cards;
  assert.equal(stuck.kind, 'NEVER_FIXED');
  const S = countLedger(emptyLedger(), { runid: 'mshcpdg4', cards: [stuck], workflow: 'bareagent-u-types', place: null, specHash: null, trust: 'deterministic', now: NOW });
  assert.equal(S.rows.length, 1);
  assert.equal(S.rows[0].count, 1);
  assert.match(S.rows[0].lesson, /got stuck here, never fixed\.$/);
});

test('a card of another job never joins this job\'s row', () => {
  let L = fold(emptyLedger(), sorted[0]);
  L = fold(L, sorted[1], { workflow: 'another-job' });
  assert.equal(L.rows.filter((r) => r.sample.check === 'typecheck').length, 2);
});

test('keep-all: a row last seen 200 days ago stays in the ledger (count and run ids intact) but is NOT in the planner block; seen again it is the SAME row, count +1, and read again', () => {
  let L = emptyLedger();
  for (const id of sorted) L = fold(L, id);
  const top = L.rows.find((r) => r.sample.check === 'typecheck');
  assert.equal(top?.count, 5);
  const last = new Date(top?.lastSeen ?? '').getTime();
  const ctx = (/** @type {Date} */ now) => ({ workflow: WF, place: '/p/aurora', workflowKey: 'k1', now });
  assert.equal(readableRows(L, ctx(new Date(last + DECAY_DAYS * DAY))).some((r) => r.id === top?.id), true, 'exactly 56 days is not yet old');
  const t200 = new Date(last + 200 * DAY);
  assert.equal(readableRows(L, ctx(new Date(last + DECAY_DAYS * DAY + 1000))).some((r) => r.id === top?.id), false, 'past 56 days: not in memory');
  assert.equal(renderHints(L, ctx(t200)).ids.includes(top?.id ?? ''), false, 'not in the block at 200 days');
  // the ledger keeps it: a recompute (recordHealth runs `finish`) at 200 days deletes nothing and stamps nothing
  const kept = recordHealth(L, 'h', { cards: [], suspect: [], thin: 0, noise: null }, t200.toISOString(), t200);
  const row = kept.rows.find((r) => r.id === top?.id);
  assert.equal(kept.rows.length, L.rows.length);
  assert.equal(row?.count, 5);
  assert.deepEqual(row?.runIds, top?.runIds);
  assert.equal('status' in (row ?? {}) || 'expiredBy' in (row ?? {}), false, 'no expiry flag is written');
  // seen again (the record is edited: a new run id and date on a real card): same row, count +1, back in the block
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  const fresh = { ...c, runid: 'newrun01', id: 'newrun01:typecheck:fixed', at: t200.toISOString() };
  const back = countLedger(kept, { runid: 'newrun01', cards: [fresh], workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: 'deterministic', now: t200 });
  const tcs = back.rows.filter((r) => r.sample.check === 'typecheck');
  assert.equal(tcs.length, 1, 'same row, not a new one');
  assert.equal(tcs[0].id, top?.id);
  assert.equal(tcs[0].count, 6);
  assert.equal(tcs[0].lastSeen, t200.toISOString());
  assert.equal(renderHints(back, ctx(t200)).ids.includes(top?.id ?? ''), true);
  // and on disk: nothing is deleted by a later write
});

test('keep-all: a row from another job version stays in the ledger, is never in the block, and is never matched under the new hash', () => {
  let L = fold(emptyLedger(), sorted[0], { workflowKey: 'k1' });
  L = fold(L, sorted[1], { workflowKey: 'k2' });
  const tcs = L.rows.filter((r) => r.sample.check === 'typecheck');
  assert.equal(tcs.length, 2, 'the new version opens its own row');
  assert.deepEqual(tcs.map((r) => [r.workflowKey, r.count]).sort(), [['k1', 1], ['k2', 1]]);
  assert.equal(tcs.some((r) => 'status' in r || 'expiredBy' in r), false, 'no flag stored');
  const ids = (/** @type {string} */ h) => renderHints(L, { workflow: WF, place: '/p/aurora', workflowKey: h, now: NOW }).ids.filter((i) => tcs.some((r) => r.id === i));
  assert.deepEqual(ids('k2'), [tcs.find((r) => r.workflowKey === 'k2')?.id]);
  assert.deepEqual(ids('k1'), [tcs.find((r) => r.workflowKey === 'k1')?.id], 'going back to h1 reads h1 rows again: decided by the hash, not a stored flag');
  // a third run under h2 counts the h2 row, never the h1 row
  L = fold(L, sorted[2], { workflowKey: 'k2' });
  assert.deepEqual(L.rows.filter((r) => r.sample.check === 'typecheck').map((r) => [r.workflowKey, r.count]).sort(), [['k1', 1], ['k2', 2]]);
});

test('keep-all: an old on-disk ledger carrying stored status/expiredBy loads and behaves by the new rules (age by lastSeen, version by hash); the fields are stripped at the next write', (t) => {
  let L = fold(emptyLedger(), sorted[0], { workflowKey: 'k1' });
  const row = L.rows.find((r) => r.sample.check === 'typecheck');
  assert.ok(row);
  // an old file: the fresh row wrongly flagged expired-by-age, another row flagged by hash but of THIS version
  const old = { ...L, rows: L.rows.map((r) => ({ ...r, status: 'expired', expiredBy: 'age' })) };
  const home = scratch(t);
  const path = ledgerPath(home);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(old));
  const loaded = readLedger(home).ledger;
  const ctx = { workflow: WF, place: '/p/aurora', workflowKey: 'k1', now: NOW };
  assert.equal(renderHints(loaded, ctx).ids.includes(row.id), true, 'stored "expired" is ignored: lastSeen is fresh, hash matches');
  // an old-flagged row truly 200 days old stays out; seen again it counts +1
  const far = new Date(new Date(row.lastSeen).getTime() + 200 * DAY);
  assert.equal(renderHints(loaded, { ...ctx, now: far }).ids.includes(row.id), false);
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  const again = countLedger(loaded, { runid: 'newrun02', cards: [{ ...c, runid: 'newrun02', id: 'newrun02:typecheck:fixed', at: far.toISOString() }], workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: 'deterministic', now: far });
  const r2 = again.rows.find((r) => r.id === row.id);
  assert.equal(r2?.count, 2);
  assert.equal('status' in (r2 ?? {}) || 'expiredBy' in (r2 ?? {}), false, 'legacy fields stripped on the next write');
  // an old file's hash-flagged row of the CURRENT version is matched (the flag is not read)
  const oldHash = { ...L, rows: L.rows.map((r) => ({ ...r, status: 'expired', expiredBy: 'hash' })) };
  assert.equal(countLedger(oldHash, { runid: 'newrun03', cards: [{ ...c, runid: 'newrun03', id: 'newrun03:typecheck:fixed', at: NOW.toISOString() }], workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: 'deterministic', now: NOW }).rows.find((r) => r.id === row.id)?.count, 2);
});

test('an OLD hold (v0.46.x wrote them) is not counted; the human Accept releases it; 60 days of waiting drops them uncounted', () => {
  const r = cardsOf('mvh72jo0');
  const o = { runid: 'mvh72jo0', cards: r.cards, workflow: 'flights-2', place: 'www.google.com', specHash: 'h', at: r.cards[0].at };
  const t0 = new Date(r.cards[0].at);
  let L = holdPending(emptyLedger(), o, t0);
  assert.equal(L.rows.length, 0, 'nothing counted before Accept');
  assert.equal(L.pending.length, 1);
  // a re-held (resumed) run replaces its hold, never doubles it
  L = holdPending(L, o, t0);
  assert.equal(L.pending.length, 1);
  // the door answers rerun / pause: nothing here releases; only releasePending does
  const rel = releasePending(L, 'mvh72jo0', new Date(t0.getTime() + 5 * DAY));
  assert.equal(rel.released, 1);
  assert.equal(rel.ledger.pending.length, 0);
  assert.equal(rel.ledger.rows.length, 1);
  assert.equal(rel.ledger.rows[0].count, 1);
  assert.equal(rel.ledger.rows[0].trust, 'rubric');
  // idempotent: a second Accept finds nothing held
  const again = releasePending(rel.ledger, 'mvh72jo0', new Date(t0.getTime() + 6 * DAY));
  assert.equal(again.released, 0);
  assert.deepEqual(again.ledger.rows, rel.ledger.rows);
  // too late: dropped, uncounted (the boundary is 60 days)
  const ok = releasePending(L, 'mvh72jo0', new Date(t0.getTime() + PENDING_DAYS * DAY));
  assert.equal(ok.released, 1);
  const late = releasePending(L, 'mvh72jo0', new Date(t0.getTime() + PENDING_DAYS * DAY + 1000));
  assert.equal(late.released, 0);
  assert.equal(late.ledger.rows.length, 0);
  assert.equal(late.ledger.pending.length, 0);
  // and a hold nobody answered is pruned on the next write after 60 days
  const pruned = recordHealth(L, 'other', { cards: [], suspect: [], thin: 0, noise: null }, t0.toISOString(), new Date(t0.getTime() + 61 * DAY));
  assert.equal(pruned.pending.length, 0);
});

test('R2: there is no check-wide set-aside any more: one key in 4 jobs stays four ordinary per-job rows, all readable in their own job', () => {
  const ids = ['mties136', 'mv2i30bf', 'mv3sconb', 'mv1j01sl'];
  const tree = ids.map((id) => ({ id, card: cardsOf(id).cards.find((c) => c.check === 'tree-changed') }));
  assert.ok(tree.every((x) => x.card), 'a generic tree-changed red in four real jobs');
  let L = emptyLedger();
  for (const x of tree) L = countLedger(L, { runid: x.id, cards: [x.card], workflow: x.card.job, place: null, specHash: null, trust: 'deterministic', now: new Date(x.card.at) });
  assert.equal('checkWide' in L, false, 'the field is gone from the ledger');
  assert.equal(L.rows.filter((r) => r.sample.check === 'tree-changed').length, 4);
  for (const x of tree) {
    const r = renderHints(L, { workflow: x.card.job, place: null, specHash: null, now: new Date(x.card.at) });
    assert.equal(r.ids.length, 1, `${x.card.job} still reads its own tree-changed lesson`);
  }
});

test('climbing: the same lesson in 3 workflows on one place -> place; on 3 places -> user; run ids kept', () => {
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  // the rows are edited copies of ONE real lesson placed in other workflows / places
  const row = (/** @type {string} */ wf, /** @type {string} */ place) => ({
    id: wf, lesson: lessonOf(c), count: 1, sample: { ...c, job: wf }, models: {}, workflow: wf, place, level: /** @type {const} */ ('workflow'),
    trust: /** @type {const} */ ('deterministic'), runIds: [`run-${wf}`], firstSeen: c.at, lastSeen: c.at, specHash: null, key: 'k',
  });
  const two = climb([row('a', 'P'), row('b', 'P')]);
  assert.deepEqual(two.map((r) => r.level), ['workflow', 'workflow'], 'two workflows do not climb');
  const three = climb([row('a', 'P'), row('b', 'P'), row('c', 'P')]);
  assert.deepEqual(three.map((r) => r.level), ['place', 'place', 'place']);
  assert.deepEqual(three.map((r) => r.runIds), [['run-a'], ['run-b'], ['run-c']]);
  const user = climb([row('a', 'P1'), row('b', 'P2'), row('c', 'P3')]);
  assert.deepEqual(user.map((r) => r.level), ['user', 'user', 'user']);
  // different lessons never climb together
  const other = { ...row('c', 'P'), sample: { ...c, job: 'c', kinds: ['TS9999'] } };
  assert.deepEqual(climb([row('a', 'P'), row('b', 'P'), other]).map((r) => r.level), ['workflow', 'workflow', 'workflow']);
});

test('climbing: 2000 identical-lesson rows form one family, quickly (union-find path compression)', () => {
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  const rows = Array.from({ length: 2000 }, (_, i) => ({
    id: `r${i}`, lesson: lessonOf(c), count: 1, sample: { ...c, job: `w${i}` }, models: {}, workflow: `w${i}`, place: `/p/${i % 7}`,
    level: /** @type {const} */ ('workflow'), trust: /** @type {const} */ ('deterministic'), runIds: [`x${i}`], firstSeen: c.at, lastSeen: c.at, specHash: null, key: 'k',
  }));
  const t = performance.now();
  const out = climb(rows);
  const ms = performance.now() - t;
  assert.equal(out.length, 2000);
  assert.deepEqual([...new Set(out.map((r) => r.level))], ['user'], 'one family across 7 places climbs to user');
  assert.ok(ms < 5000, `climb took ${Math.round(ms)} ms (bound 5000; path compression keeps it near 1 s)`);
});

test('the place of a job: a repo or folder path as written, a website\'s host, none when there are no inputs', () => {
  assert.equal(placeOf({ inputs: [{ n: 1, label: 'repo', value: '/home/x/proj' }] }), '/home/x/proj');
  assert.equal(placeOf({ inputs: [{ n: 1, label: 'page', value: 'https://www.google.com/travel/flights?q=1' }] }), 'www.google.com');
  assert.equal(placeOf({ inputs: [{ n: 1, label: 'repo', value: 'rel/dir' }] }, (p) => `/abs/${p}`), '/abs/rel/dir');
  assert.equal(placeOf({}), null);
  assert.equal(placeOf({ inputs: [] }), null);
});

test('disk: the ledger lives under <home>/learn/ledger.json, written atomically and mode 600, secrets masked, missing = empty', (t) => {
  const home = scratch(t);
  assert.equal(ledgerPath(home), join(home, 'learn', 'ledger.json'));
  assert.deepEqual(readLedger(home), { ledger: emptyLedger(), exists: false, problem: null });
  assert.equal(existsSync(join(home, 'learn')), false, 'reading never creates the directory');
  const token = `ghp_${'a1B2c3D4e5F6g7H8i9J0'.repeat(2)}`;
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  const L = countLedger(emptyLedger(), { runid: 'r', cards: [{ ...c, goal: `use ${token} here` }], workflow: WF, place: null, specHash: null, trust: 'deterministic', now: NOW });
  const file = writeLedger(L, home);
  assert.equal(file, ledgerPath(home));
  assert.deepEqual(readdirSync(join(home, 'learn')), ['ledger.json'], 'no temp file left behind');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(!readFileSync(file, 'utf8').includes(token), 'a secret in a person\'s repo never enters the record');
  assert.equal(readLedger(home).problem, null);
  assert.equal(readLedger(home).ledger.rows.length, 1);
});

test('disk: a corrupt ledger is reported and never silently reset by the run-end write', (t) => {
  const home = scratch(t);
  mkdirSync(join(home, 'learn'));
  writeFileSync(ledgerPath(home), '{ not json');
  assert.match(/** @type {string} */ (readLedger(home).problem), /not readable JSON/);
  const out = foldRunIntoLedger({ home, runid: 'x', build: cardsOf('mvk2e4uy'), workflow: 'w', place: null, specHash: null, trust: 'deterministic', at: '2026-10-22T00:00:00Z', now: NOW });
  assert.equal(out.wrote, false);
  assert.equal(readFileSync(ledgerPath(home), 'utf8'), '{ not json');
});

test('disk: foldRunIntoLedger counts a deterministic run; a rubric run counts at run end too (no hold), and an OLD hold still releases on Accept', (t) => {
  const home = scratch(t);
  const det = cardsOf('mvk2e4uy');
  const out = foldRunIntoLedger({ home, runid: 'mvk2e4uy', build: det, workflow: 'pulselog-panel-strict', place: '/p', specHash: 'h', trust: 'deterministic', at: det.cards[0].at, now: new Date(det.cards[0].at) });
  assert.deepEqual([out.wrote, out.counted, out.held], [true, 1, 0]);
  assert.equal(readLedger(home).ledger.rows.length, 1);
  assert.equal(readLedger(home).ledger.suspect.length, 1, 'the CHECK-SUSPECT card is listed, not counted');
  assert.deepEqual(readLedger(home).ledger.health.mvk2e4uy, { at: det.cards[0].at, noise: null, cards: 1, suspect: 1, thin: 0 });
  // the same run again: the tally does not move
  foldRunIntoLedger({ home, runid: 'mvk2e4uy', build: det, workflow: 'pulselog-panel-strict', place: '/p', specHash: 'h', trust: 'deterministic', at: det.cards[0].at, now: new Date(det.cards[0].at) });
  assert.equal(readLedger(home).ledger.rows[0].count, 1);
  // a rubric run counts at RUN END (v1.112): a row at count 1, trust rubric, nothing held
  const rub = cardsOf('mvh72jo0');
  const now = new Date(rub.cards[0].at);
  const h = foldRunIntoLedger({ home, runid: 'mvh72jo0', build: rub, workflow: 'flights-2', place: 'www.google.com', specHash: 'h', trust: 'rubric', at: rub.cards[0].at, now });
  assert.deepEqual([h.counted, h.held], [1, 0]);
  const rows = readLedger(home).ledger.rows.filter((r) => r.workflow === 'flights-2');
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].count, rows[0].trust], [1, 'rubric']);
  assert.equal(readLedger(home).ledger.pending.length, 0, 'no new hold is ever written');
  // the same rubric run folded twice stays count 1
  foldRunIntoLedger({ home, runid: 'mvh72jo0', build: rub, workflow: 'flights-2', place: 'www.google.com', specHash: 'h', trust: 'rubric', at: rub.cards[0].at, now });
  assert.equal(readLedger(home).ledger.rows.find((r) => r.workflow === 'flights-2')?.count, 1);
  // an OLD hold (written by v0.46.x) still releases on the door Accept
  const old = cardsOf('mvh72jo0');
  const L0 = holdPending(readLedger(home).ledger, { runid: 'oldhold1', cards: old.cards, workflow: 'flights-old', place: null, specHash: 'h', at: old.cards[0].at }, now);
  writeLedger(L0, home);
  assert.deepEqual(releaseRun({ home, runid: 'oldhold1', now }), { released: 1, problem: null });
  assert.equal(readLedger(home).ledger.rows.filter((r) => r.workflow === 'flights-old').length, 1);
  assert.equal(readLedger(home).ledger.pending.length, 0);
  assert.deepEqual(releaseRun({ home, runid: 'oldhold1', now }), { released: 0, problem: null });
});

test('a resumed leg (same run id) turns its own NEVER FIXED row into the FIXED sample; count stays 1, models unchanged, run id once', () => {
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  const leg1 = { ...c, kind: 'NEVER_FIXED', id: `${c.id}-nf`, fixTouched: [], whatChanged: null, model: 'deepseek-flash' };
  const leg2 = { ...c, kind: 'FIXED', at: new Date(new Date(c.at).getTime() + 3600_000).toISOString(), model: 'deepseek-flash' };
  // real card shape: the leg-2 FIXED card matches the leg-1 row's sample
  assert.equal(cardsMatch(leg2, leg1).match, true);
  const o = { runid: 'ms2c0ls7', workflow: WF, place: '/p/aurora', workflowKey: 'k1', trust: /** @type {const} */ ('deterministic'), now: NOW };
  let L = countLedger(emptyLedger(), { ...o, cards: [leg1] });
  assert.equal(L.rows[0].sample.kind, 'NEVER_FIXED');
  L = countLedger(L, { ...o, cards: [leg2] });
  assert.equal(L.rows.length, 1, 'no second row for the same run');
  assert.equal(L.rows[0].sample.kind, 'FIXED');
  assert.equal(L.rows[0].lesson, lessonOf(leg2));
  assert.equal(L.rows[0].lastSeen, leg2.at);
  assert.equal(L.rows[0].count, 1);
  assert.deepEqual(L.rows[0].models, { 'deepseek-flash': 1 });
  assert.deepEqual(L.rows[0].runIds, ['ms2c0ls7']);
  // the leg-1 cards re-folded alongside (the whole spine is re-read at each leg end): still one row, count 1
  const again = countLedger(L, { ...o, cards: [leg1, leg2] });
  assert.equal(again.rows.length, 1);
  assert.equal(again.rows[0].count, 1);
  assert.deepEqual(again.rows[0].models, { 'deepseek-flash': 1 });
});

// ---- the job version is the WORKFLOW key (hamr 2026-10-24): Reuse's rule, not the signed hash ----
// Real-shaped specs: the tracked mvk2e4uy spec (tests/fixtures/learn; same content as the attempt-diff live session's resolved spec), with only the named field changed.
const BASE_SPEC = JSON.parse(readFileSync(new URL('./fixtures/learn/mvk2e4uy-spec.json', import.meta.url), 'utf8'));
const withCap = (/** @type {number} */ d) => ({ ...BASE_SPEC, budgetUsd: BASE_SPEC.budgetUsd + d });
const keyOf = (/** @type {any} */ spec) => workflowKey(spec);
const tcRows = (/** @type {any} */ L) => L.rows.filter((/** @type {any} */ r) => r.sample.check === 'typecheck');

test('workflow key: a cap change moves the signed hash but not the workflow key (the premise of the ruling)', () => {
  assert.notEqual(jobSpecHash(withCap(0.5)), jobSpecHash(BASE_SPEC));
  assert.equal(keyOf(withCap(0.5)), keyOf(BASE_SPEC));
});

test('two runs of one workflow whose specs differ only in the cap: one row, count 2', () => {
  let L = fold(emptyLedger(), sorted[0], { specHash: jobSpecHash(BASE_SPEC), workflowKey: keyOf(BASE_SPEC) });
  L = fold(L, sorted[1], { specHash: jobSpecHash(withCap(0.5)), workflowKey: keyOf(withCap(0.5)) });
  assert.equal(tcRows(L).length, 1);
  assert.equal(tcRows(L)[0].count, 2);
});

test('a resume that raises the cap folds the same run id under a new hash: one row, count 1, refreshed', () => {
  let L = fold(emptyLedger(), sorted[0], { specHash: jobSpecHash(BASE_SPEC), workflowKey: keyOf(BASE_SPEC) });
  const leg2 = withCap(0.5);
  L = fold(L, sorted[0], { specHash: jobSpecHash(leg2), workflowKey: keyOf(leg2) });
  assert.equal(tcRows(L).length, 1, 'one run is never two rows');
  assert.equal(tcRows(L)[0].count, 1);
  assert.equal(tcRows(L)[0].specHash, jobSpecHash(leg2), 'specHash records the latest signed spec');
});

test('a row written under one cap is read by a run under another cap', () => {
  const L = fold(emptyLedger(), sorted[0], { specHash: jobSpecHash(BASE_SPEC), workflowKey: keyOf(BASE_SPEC) });
  const ids = (/** @type {any} */ spec) => renderHints(L, { workflow: WF, place: '/p/aurora', specHash: jobSpecHash(spec), workflowKey: keyOf(spec), now: NOW }).ids;
  assert.deepEqual(ids(withCap(0.5)), ids(BASE_SPEC));
  assert.equal(ids(withCap(0.5)).length > 0, true);
});

test('a real job change (another goal) opens its own row and is not read', () => {
  const other = { ...BASE_SPEC, goal: `${BASE_SPEC.goal} and also something else entirely` };
  assert.notEqual(keyOf(other), keyOf(BASE_SPEC));
  let L = fold(emptyLedger(), sorted[0], { workflowKey: keyOf(BASE_SPEC) });
  L = fold(L, sorted[1], { workflowKey: keyOf(other) });
  assert.equal(tcRows(L).length, 2);
  const ids = renderHints(L, { workflow: WF, place: '/p/aurora', workflowKey: keyOf(other), now: NOW }).ids;
  assert.deepEqual(ids.filter((i) => tcRows(L).some((/** @type {any} */ r) => r.id === i)), [tcRows(L).find((/** @type {any} */ r) => r.workflowKey === keyOf(other))?.id]);
});

test('an old row with no workflowKey (only specHash) is still read and matched, then gains the key', () => {
  let L = fold(emptyLedger(), sorted[0], { specHash: 'old-signed-hash', workflowKey: null });
  assert.equal(tcRows(L)[0].workflowKey, null);
  assert.equal(readableRows(L, { workflow: WF, place: '/p/aurora', workflowKey: keyOf(BASE_SPEC), now: NOW }).some((r) => r.sample.check === 'typecheck'), true);
  L = fold(L, sorted[1], { specHash: jobSpecHash(BASE_SPEC), workflowKey: keyOf(BASE_SPEC) });
  assert.equal(tcRows(L).length, 1);
  assert.equal(tcRows(L)[0].count, 2);
  assert.equal(tcRows(L)[0].workflowKey, keyOf(BASE_SPEC));
});
