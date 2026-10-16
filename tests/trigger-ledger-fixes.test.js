// T Part 1 (PANEL-BUILD.md T addendum, E.2 / T17): the ledger reader skips a torn line AND the appender starts
// the next row on a fresh line. Both halves land together; each test below fails if either half is missing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { appendFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { appendRow, readLedger, withoutReleased } from '../src/triggerledger.js';

const dir = () => mkdtempSync(path.join(tmpdir(), 'tledger-'));

test('a torn line is skipped and the next append does not glue', () => {
  const f = path.join(dir(), 'ledger.jsonl');
  appendRow(f, { id: 'a', kind: 'armed', at: 1, sig: 's' });
  appendFileSync(f, '{"id":"ran:abc","kind":"ra'); // torn: no newline
  const mid = readLedger(f);
  assert.equal(mid.rows.length, 1);
  assert.equal(mid.skipped, 1);
  appendRow(f, { id: 'ran:def', kind: 'ran', sha: 'def', sig: 's' });
  const after = readLedger(f);
  assert.deepEqual(after.rows.map((r) => r.id), ['a', 'ran:def'], 'both good rows parse');
  assert.equal(after.skipped, 1, 'the torn line is its own line');
  const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith('{"id":"ran:abc"') && !lines[1].includes('ran:def'), 'not glued');
  assert.throws(() => appendRow(f, { id: 'ran:def', kind: 'ran', sig: 's' }, { once: true }), /already written/, 'the ran sha does not arrive again');
});

test('skip-only is not enough: a stub appender without the fresh-line half makes the glue test fail', () => {
  const f = path.join(dir(), 'ledger.jsonl');
  appendRow(f, { id: 'a', kind: 'armed', at: 1, sig: 's' });
  appendFileSync(f, '{"id":"ran:abc","kind":"ra');
  // the stub: skip-only world, plain appendFileSync with no fresh line
  appendFileSync(f, `${JSON.stringify({ id: 'ran:def', kind: 'ran', sig: 's' })}\n`);
  const r = readLedger(f);
  assert.deepEqual(r.rows.map((x) => x.id), ['a'], 'the good row was swallowed into the torn line');
});

test('a missing file reads as no rows; blank and non-object lines are skipped and counted', () => {
  const d = dir();
  assert.deepEqual(readLedger(path.join(d, 'none.jsonl')), { rows: [], skipped: 0 });
  const f = path.join(d, 'l.jsonl');
  writeFileSync(f, '\n[1]\n"x"\n{"id":"ok","kind":"armed"}\n');
  const r = readLedger(f);
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 2);
});

test('rows are write-once by id when asked; the file is 0600 and its dir 0700', () => {
  const d = dir();
  const f = path.join(d, 'sub', 'ledger.jsonl');
  appendRow(f, { id: 'x', kind: 'armed', sig: 's' }, { once: true });
  assert.throws(() => appendRow(f, { id: 'x', kind: 'armed', sig: 's' }, { once: true }), /already written/);
  assert.throws(() => appendRow(f, { kind: 'armed', sig: 's' }, { once: true }), /needs an id/);
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(f)).mode & 0o777, 0o700);
});

test('withoutReleased: a released row cancels the latest earlier row with that id, in order', () => {
  const rows = [
    { id: 'ran:a', kind: 'ran' }, { kind: 'released', of: 'ran:a' },
    { id: 'ran:a', kind: 'ran', n: 2 }, { id: 'ran:b', kind: 'ran' },
  ];
  assert.deepEqual(withoutReleased(rows).map((r) => [r.id, r.n]), [['ran:a', 2], ['ran:b', undefined]]);
  assert.deepEqual(withoutReleased([{ kind: 'released', of: 'ran:zzz' }]), [], 'a release with nothing to cancel is dropped');
});

// ---- T16 (E.1): `ran` only after the starter says it would accept ----
import { fireWorld, tmp as wtmp } from './trigger-world.mjs';
import { createHash } from 'node:crypto';
import { rmSync as rm, writeFileSync as wf } from 'node:fs';
import { join as pjoin } from 'node:path';
import { queueOf, readSeen, recordArrived } from '../src/triggerfiles.js';

test('a persistently refused start writes a bounded number of rows (NEW test #1, T16)', async () => {
  const w = await fireWorld({ when: 'files' });
  const f = pjoin(w.inbox, 'a.csv');
  wf(f, 'a,1\n');
  const sha = createHash('sha256').update('a,1\n').digest('hex');
  recordArrived(w.ledger, { path: f, sha, size: 4 }, 100, w.sig);
  const key = pjoin(w.home, '.env');
  rm(key); // the keys are gone: wouldAccept says no
  const before = readLedger(w.ledger).rows.length;
  for (let i = 0; i < 500; i += 1) await w.door.fire('sched-job', { kind: 'file', path: f, sha, size: 4 });
  const rows = readLedger(w.ledger).rows;
  assert.equal(rows.filter((r) => r.kind === 'ran').length, 0, 'no ran row');
  assert.equal(rows.filter((r) => r.kind === 'unran').length, 0, 'no unran row either: nothing was consumed to undo');
  assert.equal(rows.filter((r) => r.kind === 'refused').length, 1, 'told once');
  assert.equal(rows.length - before, 1, 'exactly one new row after 500 ticks');
  assert.equal(queueOf(readSeen(w.ledger)).length, 1, 'the file is still queued');
  assert.equal(w.spawnFn.spawns.length, 0);
  // the key appears: the next tick writes exactly one ran and one started
  wf(key, 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  assert.equal((await w.door.fire('sched-job', { kind: 'file', path: f, sha, size: 4 })).outcome, 'started');
  const after = readLedger(w.ledger).rows;
  assert.equal(after.filter((r) => r.kind === 'ran').length, 1);
  assert.equal(after.filter((r) => r.kind === 'started').length, 1);
  assert.equal(queueOf(readSeen(w.ledger)).length, 0);
});

test('told once per key, and last outcome counts only rows under the current signature (read side)', async () => {
  const w = await fireWorld();
  rm(pjoin(w.home, '.env'));
  await w.door.fire('sched-job', { kind: 'clock', slot: 1, catchUp: false, missed: 0 });
  const read = w.door.read('sched-job');
  assert.equal(read.lastOutcome.kind, 'refused');
  assert.equal(read.lastOutcome.sig, w.sig);
});
void wtmp;
