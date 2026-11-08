// R9 9.6 (fwd f25a3bd): names with numbers order as numbers. `#10` must not queue before `#9` when two tickets arrive at the same instant.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareNatural } from '../src/natural.js';
import { appendSeen, queueOf, readSeen } from '../src/triggerfiles.js';

test('compareNatural: digit runs are numbers, long numbers keep every digit, leading zeros do not matter', () => {
  const sorted = (a) => [...a].sort(compareNatural);
  assert.deepEqual(sorted(['#10', '#9', '#100', '#8']), ['#8', '#9', '#10', '#100']);
  assert.deepEqual(sorted(['#9007199254740993', '#9007199254740992']), ['#9007199254740992', '#9007199254740993']);
  assert.equal(compareNatural('#007', '#7'), 0);
  assert.ok(compareNatural('a', 'b') < 0 && compareNatural('b', 'a') > 0 && compareNatural('x', 'x') === 0);
  assert.ok(compareNatural('run', 'run-1') < 0, 'a prefix sorts first');
});

test('queueOf: tickets that arrived at the same instant queue #9 before #10', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nat-'));
  const ledger = join(dir, 'seen.jsonl');
  try {
    for (const n of [10, 9, 100, 8]) {
      appendSeen(ledger, { id: `arrived:${n}`, kind: 'arrived', sha: `s${n}`, name: `#${n}`, path: `#${n}`, size: 0, at: 5, number: n }, 'sigA');
    }
    assert.deepEqual(queueOf(readSeen(ledger, 'sigA')).map((q) => q.name), ['#8', '#9', '#10', '#100']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
