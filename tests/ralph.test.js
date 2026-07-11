// Shell exit criteria, as behavior tests over the public API (spine read back
// as a pure listener). Reference semantics: adaptlearn's M0 suite. The suite
// can fail — the green-path scenario exists so a shell hardwired to red is
// caught, and vice versa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSpine } from '../src/spine.js';
import { ralph } from '../src/ralph.js';

const noop = () => {};
const dir = mkdtempSync(join(tmpdir(), 'ralph-test-'));

async function run(name, close, capRuns = 3, middle = noop) {
  const file = join(dir, `${name}.jsonl`);
  const outcome = await ralph({ middle, close, capRuns, emit: makeSpine(file) });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  return { outcome, events };
}

const RED = ['node', '-e', 'console.error("gap: artifact missing"); process.exit(1)'];
const GREEN = ['node', '-e', 'process.exit(0)'];
const BROKEN = [join(dir, 'no-such-close')];

test('noop middle: red every iteration, cap-halt own category, decision-ready escalation', async () => {
  const { outcome, events } = await run('noop-red', RED);
  assert.equal(outcome, 'escalated');
  assert.deepEqual(
    events.filter((e) => e.type === 'close-verdict').map((e) => e.verdict),
    ['needs_revision', 'needs_revision', 'needs_revision'],
  );
  const halt = events.find((e) => e.type === 'cap-halt');
  assert.equal(halt.category, 'cap-halt');
  const esc = events.find((e) => e.type === 'escalation');
  assert.ok(esc.decisionReady);
  assert.equal(esc.category, 'cap-halt');
  assert.ok(esc.options.length >= 2);
  assert.deepEqual(esc.spend, { runs: 3, capRuns: 3 });
  assert.equal(esc.verdicts.length, 3);
  assert.equal(events.at(-1).outcome, 'escalated');
});

test('passing close: green at first iteration, stop-at-first-green, no escalation', async () => {
  const { outcome, events } = await run('green', GREEN);
  assert.equal(outcome, 'green');
  assert.deepEqual(
    events.map((e) => e.type),
    ['run-start', 'iteration-start', 'middle-done', 'close-verdict', 'run-end'],
  );
  assert.equal(events.at(-1).outcome, 'green');
});

test('broken close: failed verdict escalates immediately, never retried', async () => {
  const { outcome, events } = await run('broken', BROKEN);
  assert.equal(outcome, 'escalated');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1);
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'broken-close');
  assert.ok(esc.decisionReady);
});

test('gap feeds back to the middle on the next iteration', async () => {
  const gaps = [];
  await run('gap-feedback', RED, 2, (_i, gap) => gaps.push(gap));
  assert.equal(gaps[0], undefined);
  assert.match(gaps[1], /artifact missing/);
});

test('a middle that fixes the world by iteration 2 closes green under the same cap', async () => {
  const flag = join(dir, 'fixed-marker');
  const close = ['node', '-e', `require('node:fs').existsSync(${JSON.stringify(flag)}) ? process.exit(0) : process.exit(1)`];
  const middle = (i) => { if (i === 2) writeFileSync(flag, 'green'); };
  const { outcome, events } = await run('recovers', close, 3, middle);
  assert.equal(outcome, 'green');
  assert.equal(events.at(-1).iterations, 2);
});

test('a real node --test close reds under the test runner (NODE_TEST_CONTEXT strip is load-bearing)', async () => {
  // Confound check: this test only proves the strip if the hazard is present here.
  // adaptlearn verified 2026-07-08: with NODE_TEST_CONTEXT set, a failing
  // `node --test` exits 0 — a fake green, the only real failure (design law #8).
  assert.ok(process.env.NODE_TEST_CONTEXT, 'runner must set NODE_TEST_CONTEXT or this test is vacuous');
  const failing = join(dir, 'failing-close.js');
  writeFileSync(failing, `
    const { test } = require('node:test');
    const assert = require('node:assert');
    test('close red', () => { assert.equal(1, 2); });
  `);
  const { outcome, events } = await run('real-close-red', ['node', '--test', failing], 1);
  assert.equal(outcome, 'escalated', 'a failing real close must red, never fake-green');
  assert.equal(events.find((e) => e.type === 'close-verdict').verdict, 'needs_revision');
});

test('spine: seq monotonic from 1, ts stamped last on every event', async () => {
  const { events } = await run('spine-shape', RED, 2);
  events.forEach((e, i) => {
    assert.equal(e.seq, i + 1);
    assert.equal(Object.keys(e).at(-1), 'ts');
    assert.ok(!Number.isNaN(Date.parse(e.ts)));
  });
});

test('spine: reserved envelope keys (type/seq/ts) cannot be overridden by a spread payload', () => {
  const emit = makeSpine(join(dir, 'reserved.jsonl'));
  const ev = emit('honest', { type: 'evil', seq: 999, ts: 'evil', keep: 1 });
  assert.equal(ev.type, 'honest', 'payload type must not relabel the event');
  assert.equal(ev.seq, 1, 'payload seq must not break monotonicity');
  assert.equal(ev.keep, 1, 'non-reserved payload keys pass through');
  assert.equal(Object.keys(ev).at(-1), 'ts', 'ts stays the final key');
  assert.ok(!Number.isNaN(Date.parse(ev.ts)), 'ts is the spine\'s stamp, not the payload\'s');
});
