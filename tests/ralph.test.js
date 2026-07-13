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
import { ralph, runClose } from '../src/ralph.js';

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

test('a silent red close still yields a truthy gap (feedback and stall detection stay alive)', async () => {
  const gaps = [];
  await run('silent-red', ['node', '-e', 'process.exit(1)'], 2, (_i, gap) => gaps.push(gap));
  assert.ok(gaps[1], 'gap must be truthy — every consumer guards with `if (gap)`');
  assert.match(gaps[1], /no output/);
});

test('a middle throwing a category named after an Object.prototype member escalates cleanly', async () => {
  const middle = () => {
    const err = new Error('weird category');
    /** @type {any} */ (err).category = 'toString';
    throw err;
  };
  const { outcome, events } = await run('proto-category', GREEN, 3, middle);
  assert.equal(outcome, 'escalated', 'must escalate, never crash inside the escalation path');
  const esc = events.find((e) => e.type === 'escalation');
  assert.ok(esc, 'escalation event reached the spine');
  assert.ok(esc.decisionReady);
  assert.match(esc.decision, /middle itself broke/, 'unknown category falls back to the generic decision');
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

// ---- secrets never enter the spine (hard line): the shell scrubs close output
// at the SOURCE, before gap becomes a spine event or a worker prompt. The
// redactor is INJECTED (ralph stays stdlib-only); default is identity. ----

test('runClose scrubs a secret from the gap via the injected redactor, before it is returned', () => {
  const close = ['node', '-e', 'console.error("GET 401 Authorization: Bearer " + "sk-" + "ant-abcdefghijklmnop"); process.exit(1)'];
  const redact = (x) => String(x).replace(/Bearer\s+sk-[\w-]+/g, 'Bearer [REDACTED]');
  const v = runClose(close, redact);
  assert.equal(v.verdict, 'needs_revision');
  assert.ok(!v.gap.includes('sk-ant'), 'the token never survives into the gap');
  assert.ok(v.gap.includes('[REDACTED]'));
});

test('runClose default redactor is identity — a benign gap is byte-identical (V4: the shell does not summarize)', () => {
  const close = ['node', '-e', 'console.error("AssertionError: 5 !== 6"); process.exit(1)'];
  const v = runClose(close);
  assert.equal(v.gap.trimEnd(), 'AssertionError: 5 !== 6');
});

// ---- N2 queue: close timeout as an option; tail-biased gap bound ----

test('a close exceeding closeTimeoutMs is a failed verdict (broken arbiter), not a hang', () => {
  const slow = ['node', '-e', 'setTimeout(() => {}, 30000)']; // would hold the event loop 30s
  const v = runClose(slow, undefined, { timeoutMs: 300 });
  assert.equal(v.verdict, 'failed', 'a timed-out close is failed, never satisfied or needs_revision');
  assert.match(v.detail, /ETIMEDOUT|timed?.?out/i, 'the detail names the timeout');
});

test('ralph threads closeTimeoutMs; a timed-out close escalates broken-close immediately', async () => {
  const file = join(dir, 'timeout.jsonl');
  const slow = ['node', '-e', 'setTimeout(() => {}, 30000)'];
  const outcome = await ralph({ middle: noop, close: slow, capRuns: 3, emit: makeSpine(file), closeTimeoutMs: 300 });
  assert.equal(outcome, 'escalated');
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'broken-close', 'a broken arbiter must not masquerade as a bad harness');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1, 'never retried');
});

test('the gap bound is tail-biased: the error at the END of long output survives (the assertion diff lives there)', () => {
  const close = ['node', '-e', 'console.error("x".repeat(3000) + "\\nAssertionError: THE-REAL-CAUSE"); process.exit(1)'];
  const v = runClose(close);
  assert.equal(v.verdict, 'needs_revision');
  assert.ok(v.gap.includes('THE-REAL-CAUSE'), 'the tail is the useful part — it must survive the bound');
  assert.ok(v.gap.includes('x'.repeat(100)), 'a head sample survives too (what ran)');
  assert.ok(v.gap.length <= 2100, `bounded (got ${v.gap.length})`);
});

test('redaction happens BEFORE the tail-biased bound: a token near the end never survives', () => {
  const close = ['node', '-e', 'console.error("x".repeat(2500) + " Bearer " + "sk-" + "tail0123456789abcdef end"); process.exit(1)'];
  const redact = (x) => String(x).replace(/sk-[\w-]+/g, '[REDACTED]');
  const v = runClose(close, redact);
  assert.ok(!v.gap.includes('sk-tail'), 'the tail token never survives');
  assert.ok(v.gap.includes('[REDACTED]'), 'the tail was included (bias) and scrubbed (order)');
});

test('ralph threads the redactor into runClose so the spine close-verdict carries no secret', async () => {
  const file = join(dir, 'scrub.jsonl');
  // token built at runtime so it is NOT literal in the argv (run-start emits close.join(' ');
  // a real close argv comes from the validator-swept job spec and cannot carry a secret)
  const close = ['node', '-e', 'console.error("Bearer " + "sk-" + "live0123456789abcdef"); process.exit(1)'];
  const redact = (x) => String(x).replace(/sk-[\w-]+/g, '[REDACTED]');
  await ralph({ middle: noop, close, capRuns: 1, emit: makeSpine(file), redact });
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('sk-live'), 'no token anywhere on the spine');
  const cv = raw.trimEnd().split('\n').map((l) => JSON.parse(l)).find((e) => e.type === 'close-verdict');
  assert.ok(cv.gap.includes('[REDACTED]'));
});

// ---- the close runs where the WORK is (F8, found by the real job #1 run) ----
// A close is a command in a repository: `npm test`, `make check`, `./gradlew test`
// — every one of them is cwd-relative. Run it in the wrong directory and the
// arbiter judges the wrong tree; exit-code-is-truth becomes exit-code-of-something-
// else-is-truth. The old suite could never catch this: every test close named an
// ABSOLUTE path, so cwd never mattered.

test('runClose executes the close in the given cwd — a cwd-relative close judges THAT tree, not the runner\'s', () => {
  const repo = mkdtempSync(join(tmpdir(), 'close-cwd-'));
  writeFileSync(join(repo, 'check.mjs'), 'process.exit(0)');           // greens ONLY from inside repo
  const elsewhere = mkdtempSync(join(tmpdir(), 'close-cwd-other-'));
  writeFileSync(join(elsewhere, 'check.mjs'), 'process.exit(1)');      // the same relative name, red

  const green = runClose(['node', 'check.mjs'], undefined, { cwd: repo });
  assert.equal(green.verdict, 'satisfied', 'the close ran inside the workdir');

  const red = runClose(['node', 'check.mjs'], undefined, { cwd: elsewhere });
  assert.equal(red.verdict, 'needs_revision', 'the SAME argv reds in the other tree — cwd is load-bearing');
});

test('ralph threads cwd to every close it runs — the arbiter never judges another repository', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'ralph-cwd-'));
  writeFileSync(join(repo, 'check.mjs'), 'process.exit(1)'); // red until the middle fixes it
  const file = join(dir, 'ralph-cwd.jsonl');
  const middle = () => writeFileSync(join(repo, 'check.mjs'), 'process.exit(0)');
  const outcome = await ralph({ middle, close: ['node', 'check.mjs'], capRuns: 2, emit: makeSpine(file), cwd: repo });
  assert.equal(outcome, 'green', 'the close saw the middle\'s work because it ran where the work is');
});
