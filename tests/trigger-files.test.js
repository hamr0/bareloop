// T Part 2 (PANEL-BUILD.md T addendum): the file triggers, mirrored from fwdloop test/m9-files.test.js.
// $0, no network, no sleeps: poll() is driven by hand, and mtimes are set explicitly so filesystem
// timestamp granularity cannot make a case flake.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import {
  writeFileSync, appendFileSync, mkdirSync, symlinkSync, unlinkSync, utimesSync, readFileSync, mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { queueOf as queueOfSync, createFileTrigger, readSeen, recordArrived, recordDropped, recordRan, STABLE_POLLS } from '../src/triggerfiles.js';
import { appendRow } from '../src/triggerledger.js';

const root = () => mkdtempSync(path.join(tmpdir(), 'tfiles-'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
/** @returns {{dir:string, ledger:string, base:string}} */
function setup() {
  const base = root(); const dir = path.join(base, 'inbox'); mkdirSync(dir);
  return { base, dir, ledger: path.join(base, 'seen.jsonl') };
}
const LEDGERS = new WeakMap();
const SIG = 'sig-test';
const mkTrigger = (o) => { const w = createFileTrigger({ sig: SIG, ...o }); LEDGERS.set(w, o.ledger); return w; };
/** What the scheduler does with a poll (M9 am3: the scheduler is the ledger's only writer): arrived, then ran, each file taken. */
function record(w, items) {
  for (const it of items) { recordArrived(LEDGERS.get(w), it, Date.now(), SIG); recordRan(LEDGERS.get(w), it, Date.now(), SIG); }
  return items;
}
/** Poll `n` times, recording like the scheduler; returns every taken item. */
function pollN(w, n = STABLE_POLLS + 2) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...record(w, w.poll().arrived));
  return out;
}
let mt = 1_700_000_000;
const stamp = (p) => { mt += 10; utimesSync(p, mt, mt); };

test('stable for 2 consecutive polls: taken at the poll where size AND mtime match twice in a row', () => {
  assert.equal(STABLE_POLLS, 2);
  const { dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  const f = path.join(dir, 'a.csv'); writeFileSync(f, 'x,1\n'); stamp(f);
  assert.equal(w.poll().arrived.length, 0, 'first sight');
  assert.equal(w.poll().arrived.length, 0, 'one match');
  const r = w.poll().arrived;
  assert.equal(r.length, 1, 'two matches');
  assert.equal(r[0].sha, sha('x,1\n'));
  assert.equal(r[0].size, 4);
  assert.equal(path.basename(r[0].path), 'a.csv');
  assert.equal(pollN(w).length, 0, 'never re-taken');
});

test('a file still being written is not taken until it stops changing', () => {
  const { dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  const f = path.join(dir, 'big.csv'); writeFileSync(f, 'chunk0\n');
  const taken = [];
  for (let i = 1; i <= 8; i++) { // grows between EVERY poll
    appendFileSync(f, `chunk${i}\n`); stamp(f);
    taken.push(...w.poll().arrived); taken.push(...w.poll().arrived); // two polls on the same state is still only 1 match
    appendFileSync(f, 'more\n'); stamp(f);
  }
  assert.equal(taken.length, 0, 'growing file never taken');
  stamp(f);
  const done = pollN(w);
  assert.equal(done.length, 1);
  assert.equal(done[0].sha, sha(readFileSync(f)));
  assert.equal(done[0].size, readFileSync(f).length, 'whole file, not a prefix');
});

test('same size but new mtime counts as changing (in-place rewrite)', () => {
  const { dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  const f = path.join(dir, 'a.csv'); writeFileSync(f, 'aaaa'); stamp(f);
  w.poll(); w.poll();
  writeFileSync(f, 'bbbb'); stamp(f); // same size, different mtime, one poll before it would be taken
  assert.equal(w.poll().arrived.length, 0, 'counter restarted');
  assert.equal(w.poll().arrived.length, 0);
  const r = w.poll().arrived;
  assert.equal(r.length, 1);
  assert.equal(r[0].sha, sha('bbbb'));
});

test('same file dropped twice runs once (same name, and another name)', () => {
  const { dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  const x = path.join(dir, 'X.csv');
  writeFileSync(x, 'invoice,100\n');
  assert.equal(pollN(w).length, 1);
  writeFileSync(path.join(dir, 'X-copy.csv'), 'invoice,100\n');
  assert.equal(pollN(w).length, 0, 'same content, other name');
  unlinkSync(x); writeFileSync(x, 'invoice,100\n'); stamp(x);
  assert.equal(pollN(w).length, 0, 're-dropped under the same name');
  writeFileSync(path.join(dir, 'Y.csv'), 'invoice,200\n');
  const y = pollN(w);
  assert.deepEqual(y.map((r) => path.basename(r.path)), ['Y.csv'], 'a different file still runs');
});

test('never twice across restart: a fresh trigger on the same ledger rereads it', () => {
  const { dir, ledger } = setup();
  let w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  writeFileSync(path.join(dir, 'X.csv'), 'invoice,100\n');
  assert.equal(pollN(w).length, 1);
  w = mkTrigger({ mode: 'new', target: dir, ledger }); // restart: no process state
  const x = path.join(dir, 'X.csv'); unlinkSync(x); writeFileSync(x, 'invoice,100\n');
  writeFileSync(path.join(dir, 'again.csv'), 'invoice,100\n');
  assert.equal(pollN(w, 8).length, 0);
  assert.deepEqual(readSeen(ledger).filter((r) => r.sha === sha('invoice,100\n')).map((r) => r.kind), ['arrived', 'ran'], 'one arrived and one ran row per sha');
});

test('poll() writes nothing; arrived and ran are the caller\'s rows (a poll that was never recorded is handed out again after a restart)', () => {
  const { dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  writeFileSync(path.join(dir, 'X.csv'), 'q\n');
  w.poll(); w.poll();
  const r = w.poll().arrived;
  assert.equal(r.length, 1);
  assert.deepEqual(readSeen(ledger), [], 'no row yet: the scheduler writes them');
  const w2 = mkTrigger({ mode: 'new', target: dir, ledger });
  assert.equal(pollN(w2, 8).length, 1, 'never recorded: it arrives again');
  assert.equal(pollN(mkTrigger({ mode: 'new', target: dir, ledger }), 8).length, 0, 'recorded: it never does');
});

test('a folder holding 3 files at arm: no run (am2 item 2)', () => {
  const { dir, ledger } = setup();
  for (const n of ['a.csv', 'b.csv', 'c.csv']) writeFileSync(path.join(dir, n), `${n}\n`);
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  assert.equal(pollN(w, 10).length, 0);
  assert.equal(readSeen(ledger).filter((r) => r.kind === 'baseline').length, 3);
  writeFileSync(path.join(dir, 'd.csv'), 'd\n');
  assert.deepEqual(pollN(w).map((r) => path.basename(r.path)), ['d.csv'], 'only a new file runs');
});

test('file-updated: the current version does not run; a change after arming does; touch/same content does not', () => {
  const { base, ledger } = setup();
  const f = path.join(base, 'invoices.xlsx'); writeFileSync(f, 'v1'); stamp(f);
  const w = mkTrigger({ mode: 'updated', target: f, ledger }); w.arm();
  assert.equal(pollN(w, 8).length, 0, 'current version is the baseline');
  writeFileSync(f, 'version two'); stamp(f);
  const r = pollN(w);
  assert.equal(r.length, 1);
  assert.equal(r[0].sha, sha('version two'));
  stamp(f); // touch only
  assert.equal(pollN(w).length, 0, 'mtime moved, sha same');
  writeFileSync(f, 'v1'); stamp(f);
  assert.equal(pollN(w).length, 1, 'the baseline version coming back after a change is a change (item 6: only a sha that RAN is never run again)');
  writeFileSync(f, 'v1'); stamp(f);
  assert.equal(pollN(w).length, 0, 'now v1 has run: never again');
  writeFileSync(f, 'v3'); stamp(f);
  assert.equal(pollN(w).length, 1);
});

test('F1 file-updated: A (baseline) -> B (runs) -> A arrives; A again after it ran does not', () => {
  const { base, ledger } = setup();
  const f = path.join(base, 'f.txt'); writeFileSync(f, 'AAAA'); stamp(f);
  const w = mkTrigger({ mode: 'updated', target: f, ledger }); w.arm();
  assert.equal(pollN(w, 8).length, 0, 'armed on A: nothing');
  writeFileSync(f, 'BBBBB'); stamp(f);
  assert.deepEqual(pollN(w).map((r) => r.sha), [sha('BBBBB')]);
  writeFileSync(f, 'AAAA'); stamp(f);
  assert.deepEqual(pollN(w).map((r) => r.sha), [sha('AAAA')], 'A is a change away from B');
  writeFileSync(f, 'BBBBB'); stamp(f);
  assert.equal(pollN(w).length, 0, 'B ran: never again');
});

test('F1 a version that arrived and is still queued does not arrive twice; one that was dropped (never ran) may arrive again', () => {
  const { base, ledger } = setup();
  const f = path.join(base, 'f.txt'); writeFileSync(f, 'AAAA'); stamp(f);
  const w = mkTrigger({ mode: 'updated', target: f, ledger }); w.arm();
  writeFileSync(f, 'BBBBB'); stamp(f);
  const [b] = (() => { let r; for (let i = 0; i < 4 && !(r = w.poll().arrived).length; i++); return r; })();
  recordArrived(ledger, b, Date.now(), SIG); // queued, not run
  stamp(f);
  assert.equal(w.poll().arrived.length + w.poll().arrived.length + w.poll().arrived.length, 0, 'queued: not twice');
  recordDropped(ledger, { ...b, ...readSeen(ledger).find((r) => r.kind === 'arrived') }, 'changed', Date.now(), SIG);
  stamp(f);
  const again = (() => { let r = []; for (let i = 0; i < 4 && !r.length; i++) r = w.poll().arrived; return r; })();
  assert.deepEqual(again.map((r) => r.sha), [sha('BBBBB')], 'dropped never ran: arrives again');
  recordArrived(ledger, again[0], Date.now(), SIG);
  assert.equal(readSeen(ledger).filter((r) => r.kind === 'arrived').length, 2, 'a second arrived row is written');
  assert.deepEqual(queueOfSync(readSeen(ledger)).map((r) => r.sha), [sha('BBBBB')], 'queued again once');
});

test('new-file: a baseline file sitting in the folder never arrives, nor does its content under a NEW name (hamr 2026-10-13: content present at arm never runs)', () => {
  const { dir, ledger } = setup();
  writeFileSync(path.join(dir, 'old.csv'), 'same\n');
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  for (let i = 0; i < 20; i++) assert.equal(record(w, w.poll().arrived).length, 0, `poll ${i}: the baseline file never runs`);
  const f2 = path.join(dir, 'copy.csv'); writeFileSync(f2, 'same\n'); stamp(f2);
  assert.deepEqual(pollN(w).map((r) => path.basename(r.path)), [], 'a renamed or copied baseline file is not new: its sha was there at arm');
  const f4 = path.join(dir, 'fresh.csv'); writeFileSync(f4, 'other\n'); stamp(f4);
  assert.deepEqual(pollN(w).map((r) => path.basename(r.path)), ['fresh.csv'], 'different content still arrives');
});

test('file-updated: file missing at arm, then created, is a change and runs', () => {
  const { base, ledger } = setup();
  const f = path.join(base, 'later.csv');
  const w = mkTrigger({ mode: 'updated', target: f, ledger }); w.arm();
  assert.equal(pollN(w).length, 0, 'absent is quiet, not an error');
  writeFileSync(f, 'hello'); stamp(f);
  assert.equal(pollN(w).length, 1);
});

test('new-file: top level, regular files only; subfolders and symlinks are not taken', () => {
  const { base, dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  mkdirSync(path.join(dir, 'sub')); writeFileSync(path.join(dir, 'sub', 'deep.csv'), 'deep\n');
  const outside = path.join(base, 'secret.txt'); writeFileSync(outside, 'secret\n');
  symlinkSync(outside, path.join(dir, 'link.txt'));
  symlinkSync(path.join(base), path.join(dir, 'dirlink'));
  writeFileSync(path.join(dir, 'ok.csv'), 'ok\n');
  const out = [];
  for (let i = 0; i < 8; i++) out.push(...record(w, w.poll().arrived));
  assert.deepEqual(out.map((r) => path.basename(r.path)), ['ok.csv']);
});

test('refused symlinks are reported by name, once', () => {
  const { base, dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  const outside = path.join(base, 'secret.txt'); writeFileSync(outside, 's\n');
  symlinkSync(outside, path.join(dir, 'link.txt'));
  const first = w.poll();
  assert.equal(first.refused.length, 1);
  assert.match(first.refused[0].why, /symlink/);
  assert.equal(path.basename(first.refused[0].path), 'link.txt');
  assert.equal(w.poll().refused.length, 0, 'said once');
});

test('file-updated refuses a symlink target', () => {
  const { base, ledger } = setup();
  const real = path.join(base, 'real.csv'); writeFileSync(real, 'a');
  const link = path.join(base, 'link.csv'); symlinkSync(real, link);
  const w = mkTrigger({ mode: 'updated', target: link, ledger });
  assert.throws(() => w.arm(), /symlink/);
  const w2 = mkTrigger({ mode: 'updated', target: link, ledger });
  const r = w2.poll();
  assert.equal(r.arrived.length, 0);
  assert.match(r.refused[0].why, /symlink/);
});

test('modes and targets are validated by name', () => {
  const { dir, ledger } = setup();
  assert.throws(() => mkTrigger({ mode: 'watch', target: dir, ledger }), /mode "watch"/);
  assert.throws(() => mkTrigger({ mode: 'new', target: path.join(dir, 'nope'), ledger }).arm(), /folder/);
  const f = path.join(dir, 'f.csv'); writeFileSync(f, '1');
  assert.throws(() => mkTrigger({ mode: 'new', target: f, ledger }).arm(), /folder/);
  assert.throws(() => mkTrigger({ mode: 'updated', target: dir, ledger }).arm(), /file/);
});

test('ledger is JSONL, write-once per sha, no mutable latest file', () => {
  const { base, dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  writeFileSync(path.join(dir, 'a'), '1'); writeFileSync(path.join(dir, 'b'), '2');
  pollN(w);
  const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(new Set(rows.map((r) => r.id)).size, 4);
  assert.equal(rows.length, 4, 'one arrived and one ran row per sha');
  assert.ok(rows.every((r) => r.id === `${r.kind}:${r.sha}`));
  assert.deepEqual(readSeen(path.join(base, 'none.jsonl')), []);
});

// ---- added by T Part 2 (not in fwd): the shared job ledger, sig, release, recheck, checkTarget ----

test('every row written carries sig; clock rows in the same ledger do not disturb the file rows', () => {
  const { dir, ledger } = setup();
  appendRow(ledger, { id: 'armed:1', kind: 'armed', at: 1, sig: SIG });
  appendRow(ledger, { id: 'started:x', kind: 'started', runId: 'r1', sig: SIG });
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  writeFileSync(path.join(dir, 'a.csv'), 'a\n');
  assert.equal(pollN(w).length, 1);
  const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(rows.every((r) => r.sig === SIG));
  assert.deepEqual(readSeen(ledger).map((r) => r.kind), ['arrived', 'ran']);
});

test('a released ran row makes the file retryable: it is queued again and may run again (RULED retry)', () => {
  const { dir, ledger } = setup();
  const w = mkTrigger({ mode: 'new', target: dir, ledger }); w.arm();
  writeFileSync(path.join(dir, 'a.csv'), 'a\n');
  const [it] = pollN(w);
  assert.equal(queueOfSync(readSeen(ledger)).length, 0, 'ran: out of the queue');
  appendRow(ledger, { kind: 'released', of: `ran:${it.sha}`, sig: SIG });
  assert.deepEqual(queueOfSync(readSeen(ledger)).map((r) => r.sha), [it.sha], 'released: back at the head');
  assert.equal(recordRan(ledger, it, Date.now(), SIG), true, 'the ran id may be written again');
  assert.equal(queueOfSync(readSeen(ledger)).length, 0);
});

test('queueOf: oldest arrival first, ties by name then sha', () => {
  const { ledger } = setup();
  const mk = (name, s, at) => ({ path: `/x/${name}`, sha: s, size: 1, at });
  recordArrived(ledger, mk('b.csv', 'b'.repeat(64), 0), 100, SIG);
  recordArrived(ledger, mk('a.csv', 'a'.repeat(64), 0), 100, SIG);
  recordArrived(ledger, mk('z.csv', 'z'.repeat(64), 0), 50, SIG);
  assert.deepEqual(queueOfSync(readSeen(ledger)).map((r) => r.name), ['z.csv', 'a.csv', 'b.csv']);
});

test('recheck at use time: ok, deleted, changed, symlink', async () => {
  const { recheck } = await import('../src/triggerfiles.js');
  const { base, dir } = setup();
  const f = path.join(dir, 'a.csv'); writeFileSync(f, 'one');
  const item = { path: f, sha: sha('one') };
  assert.equal(recheck(item).state, 'ok');
  writeFileSync(f, 'two');
  assert.deepEqual(recheck(item), { state: 'changed', sha: sha('two') });
  unlinkSync(f);
  assert.equal(recheck(item).state, 'deleted');
  const out = path.join(base, 'o.csv'); writeFileSync(out, 'one'); symlinkSync(out, f);
  assert.equal(recheck(item).state, 'deleted', 'a symlink is refused at use time');
});

test('checkTarget is the one set-time rule', async () => {
  const { checkTarget } = await import('../src/triggerfiles.js');
  const { base, dir } = setup();
  checkTarget('new', dir);
  checkTarget('updated', path.join(base, 'not-yet.csv'));
  assert.throws(() => checkTarget('new', path.join(base, 'nope')), /does not exist/);
  assert.throws(() => checkTarget('updated', dir), /not a file/);
});
