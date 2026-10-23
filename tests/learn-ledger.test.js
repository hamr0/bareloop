// Cross-run learnings, part 3: the ONE ledger (ITEM33-BUILD.md rev 2, section 5 and the RULED block).
// Cards come from real archived runs; a test that edits a card or a row says so. The disk tests use a scratch home and
// never touch ~/.config/bareloop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emptyLedger, countLedger, holdPending, releasePending, recordHealth, applyDecay, climb, lessonOf, renderHints,
  DECAY_DAYS, PENDING_DAYS, placeOf,
} from '../src/learn.js';
import { readLedger, writeLedger, ledgerPath, foldRunIntoLedger, releaseRun } from '../src/learnstore.js';
import { cardsOf } from './learn-fixtures.js';

const DAY = 86_400_000;
const AURORA = ['ms2c0ls7', 'ms7flkok', 'mszi97jd', 'ms2ddxjc', 'mszcfaof'];
const built = new Map(AURORA.map((id) => [id, cardsOf(id)]));
const runAt = (/** @type {string} */ id) => /** @type {string} */ (built.get(id)?.cards[0].at);
const WF = 'aurora-u-spawner-types';
const NOW = new Date(new Date(runAt('mszcfaof')).getTime() + DAY);
const scratch = (/** @type {any} */ t) => { const d = mkdtempSync(join(tmpdir(), 'bareloop-learn-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const fold = (/** @type {any} */ L, /** @type {string} */ id, over = {}) => countLedger(L, {
  runid: id, cards: /** @type {any} */ (built.get(id)).cards, workflow: WF, place: '/p/aurora', specHash: 'h1', trust: 'deterministic', now: NOW, ...over,
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
  assert.equal(L.rows.every((r) => r.level === 'workflow' && r.trust === 'deterministic' && r.status === 'active'), true);
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

test('decay: a row untouched for 56 days is hidden (kept in the file), high count or not; a new matching card brings it back', () => {
  let L = emptyLedger();
  for (const id of sorted) L = fold(L, id);
  const top = L.rows.find((r) => r.sample.check === 'typecheck');
  assert.equal(top?.count, 5);
  const last = new Date(top?.lastSeen ?? '').getTime();
  assert.equal(applyDecay(L, new Date(last + DECAY_DAYS * DAY)).rows.find((r) => r.id === top?.id)?.status, 'active', 'exactly 56 days is not yet old');
  const old = applyDecay(L, new Date(last + DECAY_DAYS * DAY + 1000));
  const t2 = old.rows.find((r) => r.id === top?.id);
  assert.equal(t2?.status, 'expired');
  assert.equal(t2?.expiredBy, 'age');
  assert.equal(t2?.count, 5, 'kept in the file, count and run ids intact');
  assert.equal(old.rows.length, L.rows.length);
  // new evidence reactivates it: fold a fresh run (the record is edited: a new run id and date on a real card)
  const [c] = /** @type {any} */ (built.get('ms2c0ls7')).cards;
  const later = new Date(last + 100 * DAY);
  const fresh = { ...c, runid: 'newrun01', id: 'newrun01:typecheck:fixed', at: later.toISOString() };
  const back = countLedger(old, { runid: 'newrun01', cards: [fresh], workflow: WF, place: '/p/aurora', specHash: 'h1', trust: 'deterministic', now: later });
  const t3 = back.rows.find((r) => r.id === top?.id);
  assert.equal(t3?.status, 'active');
  assert.equal(t3?.count, 6);
});

test('expiry on change: a workflow row minted under another signed hash is done; the new hash makes a new row', () => {
  let L = fold(emptyLedger(), sorted[0], { specHash: 'h1' });
  L = fold(L, sorted[1], { specHash: 'h2' });
  const tcs = L.rows.filter((r) => r.sample.check === 'typecheck');
  assert.equal(tcs.length, 2);
  assert.deepEqual(tcs.map((r) => [r.specHash, r.status, r.expiredBy]).sort(), [['h1', 'expired', 'hash'], ['h2', 'active', null]]);
});

test('rubric cards are HELD, not counted; the human Accept releases them; 60 days of waiting drops them uncounted', () => {
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
    trust: /** @type {const} */ ('deterministic'), runIds: [`run-${wf}`], firstSeen: c.at, lastSeen: c.at, status: /** @type {const} */ ('active'), expiredBy: null, specHash: null, key: 'k',
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

test('disk: foldRunIntoLedger counts a deterministic run, holds a rubric run, and releaseRun frees it', (t) => {
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
  // a rubric run: held until released
  const rub = cardsOf('mvh72jo0');
  const now = new Date(rub.cards[0].at);
  const h = foldRunIntoLedger({ home, runid: 'mvh72jo0', build: rub, workflow: 'flights-2', place: 'www.google.com', specHash: 'h', trust: 'rubric', at: rub.cards[0].at, now });
  assert.deepEqual([h.counted, h.held], [0, 1]);
  assert.equal(readLedger(home).ledger.rows.filter((r) => r.workflow === 'flights-2').length, 0);
  assert.deepEqual(releaseRun({ home, runid: 'mvh72jo0', now }), { released: 1, problem: null });
  assert.equal(readLedger(home).ledger.rows.filter((r) => r.workflow === 'flights-2').length, 1);
  assert.deepEqual(releaseRun({ home, runid: 'mvh72jo0', now }), { released: 0, problem: null });
});
