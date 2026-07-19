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
    // close-unaudited rides at run-start: GREEN declares no judgment signal, so
    // the record says so out loud (PRD v1.11) rather than trusting exit 0 blindly
    ['run-start', 'close-unaudited', 'iteration-start', 'middle-done', 'close-verdict', 'run-end'],
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

// NOTE: the two tests that lived here pinned `timeout → failed → broken-close`.
// That pooling IS the F25/Z-2 collapse — "cannot run" and "did not finish
// judging" need opposite human decisions. Their surviving assertions (a timeout
// terminates rather than hangs, and is never retried) moved into the
// close-timeout tests in the forbidden-zone block below.

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

// ─── The forbidden zone (PRD v1.11 / F17, from adaptlearn F25) ───────────────
// The bands are clean green (exit == expect, judgment rendered) and clean red
// (exit != expect, judgment rendered). EVERYTHING ELSE rendered no judgment and
// is therefore NOT a verdict — it escalates by its own name and is NEVER retried
// (retrying a broken arbiter is the §5b violation adaptlearn found live).

const KILLED = ['node', '-e', 'process.kill(process.pid,"SIGKILL")'];
const HANGS = ['node', '-e', 'setTimeout(()=>{}, 30000)'];
// prints its own judged count to STDOUT while the gap comes from STDERR
const judgedClose = (n, exit) => ['node', '-e', `console.log("tests ${n}"); console.error("gap: three recall tests failed"); process.exit(${exit})`];
const JUDGED = { pattern: '^tests (\\d+)$', min: 3 };

test('close killed by signal: no judgment rendered — its own verdict, never a red', () => {
  const v = runClose(KILLED);
  assert.equal(v.verdict, 'killed', 'a signal death is not a failing test suite');
  assert.equal(v.signal, 'SIGKILL');
});

test('ralph escalates close-killed immediately and NEVER retries the broken arbiter', async () => {
  const { outcome, events } = await run('killed', KILLED, 3);
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'close-killed');
  assert.equal(esc.decisionReady, true);
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1, 'one iteration — the cap was NOT burned against a dead judge');
});

test('close timeout: "did not finish judging" is its own verdict, distinct from "cannot run"', () => {
  const v = runClose(HANGS, undefined, { timeoutMs: 300 }); // would hold the event loop 30s — terminates, never hangs
  assert.equal(v.verdict, 'timed-out', 'not pooled into failed/broken-close — the fixes differ');
  assert.match(v.detail, /never finished judging/i, 'the detail says what it is: no judgment, not a failure');
  const broken = runClose(BROKEN);
  assert.equal(broken.verdict, 'failed', 'a missing binary is still cannot-run — the two are NOT one bucket');
});

test('ralph escalates close-timeout by its own name, with raise-the-timeout among the options', async () => {
  const file = join(dir, 'timeout.jsonl');
  const outcome = await ralph({ middle: noop, close: HANGS, capRuns: 3, emit: makeSpine(file), closeTimeoutMs: 300 });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'close-timeout');
  assert.ok(esc.options.some((/** @type {string} */ o) => /timeout/i.test(o)), 'the decision names the timeout lever');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1, 'never retried — a judge that cannot answer is not re-asked');
});

test('CONTROL — an honest red that DID render judgment passes the floor and stays a plain red', () => {
  const v = runClose(judgedClose(391, 1), undefined, { judged: JUDGED });
  assert.equal(v.verdict, 'needs_revision', 'the floor must not over-trigger on a real red');
  assert.equal(v.judgedCount, 391);
  assert.match(v.gap, /three recall tests failed/);
});

test('close-crashed: exit says red but nothing was judged — a crash, not a verdict', () => {
  const v = runClose(judgedClose(1, 1), undefined, { judged: JUDGED });
  assert.equal(v.verdict, 'crashed', 'judged 1 of a declared floor of 3 — the suite died at load');
  assert.equal(v.judgedCount, 1);
});

test('close-crashed on GREEN too: exit 0 having judged nothing is a FAKE GREEN (law #8)', () => {
  const v = runClose(judgedClose(0, 0), undefined, { judged: JUDGED });
  assert.equal(v.verdict, 'crashed', 'a green that judged nothing is the only real failure there is');
  assert.notEqual(v.verdict, 'satisfied');
});

test('ralph escalates close-crashed immediately — a crashed judge is never retried', async () => {
  const file = join(dir, 'crashed.jsonl');
  const outcome = await ralph({ middle: noop, close: judgedClose(0, 1), capRuns: 3, emit: makeSpine(file), judged: JUDGED });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'close-crashed');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1);
});

test('no judged block: the close still works, and the blind spot is NAMED on the record', () => {
  const v = runClose(judgedClose(391, 1));
  assert.equal(v.verdict, 'needs_revision');
  assert.equal(v.unaudited, true, 'the hole is stamped, not hidden — an unaudited close cannot detect a crash');
  const audited = runClose(judgedClose(391, 1), undefined, { judged: JUDGED });
  assert.ok(!audited.unaudited, 'a declared floor is audited');
});

test('a judged pattern that matches nothing is a crash, not a silent pass', () => {
  const v = runClose(['node', '-e', 'console.log("no counts here"); process.exit(0)'], undefined, { judged: JUDGED });
  assert.equal(v.verdict, 'crashed');
  assert.equal(v.judgedCount, null, 'honest null: no number was rendered (F6 convention)');
});

test('close.expect is HONORED: a close whose declared success is exit 1 greens on exit 1', () => {
  assert.equal(runClose(['node', '-e', 'process.exit(1)'], undefined, { expect: 1 }).verdict, 'satisfied');
  assert.equal(runClose(['node', '-e', 'process.exit(0)'], undefined, { expect: 1 }).verdict, 'needs_revision',
    'and exit 0 is the RED — the arbiter judges against the signed number, not against 0');
});

test('the judged count is read from a REDACTED stream — a secret in the close output never rides the count', () => {
  const close = ['node', '-e', 'console.log("tests 391"); console.error("sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLLMMMM"); process.exit(1)'];
  const v = runClose(close, (s) => s.replace(/sk-ant-[A-Za-z0-9-]+/g, '[redacted]'), { judged: JUDGED });
  assert.equal(v.judgedCount, 391);
  assert.doesNotMatch(v.gap, /sk-ant-api03/);
});

// ─── worker-crash attribution (F32, from battery pass 1 / F31) ──────────────
// A crash is not a verdict (F17) — but battery pass 1 measured that 4 of 7 rows
// crashed the close because of the WORKER'S OWN EDIT, and the forbidden zone
// escalated every one without ever telling the worker. With a clean precheck
// baseline (run.js escalates a crash-at-precheck before tokens), a crash that
// follows worker writes is the worker's broken edit: the most recoverable red
// there is. Attribution is INJECTED (`workerWrites`, answered by the runner from
// the gate audit); no seam or zero writes keeps the old behavior: escalate.

test('F32: a close crash AFTER worker writes is worker-crash — fed back as a gap, retried, recoverable to green', async () => {
  const state = join(dir, 'wc-state');
  writeFileSync(state, 'pristine');
  // crashes under the judged floor while the "edit" is broken; judges honestly once fixed
  const close = ['node', '-e', `const s=require('node:fs').readFileSync(${JSON.stringify(state)},'utf8').trim(); if(s==="broken"){console.log("tests 1");process.exit(1)} console.log("tests 3"); process.exit(0)`];
  const file = join(dir, 'worker-crash-recovers.jsonl');
  /** @type {(string|undefined)[]} */
  const gaps = [];
  const middle = (/** @type {number} */ i, /** @type {string|undefined} */ gap) => {
    gaps.push(gap);
    writeFileSync(state, i === 1 ? 'broken' : 'fixed');
  };
  const outcome = await ralph({
    middle, close, capRuns: 3, emit: makeSpine(file), judged: JUDGED,
    workerWrites: () => [state], // the runner's answer from the gate audit: the worker wrote this
  });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'green', 'the crash was the worker\'s own edit — recoverable, and recovered');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 2, 'the run CONTINUED past the crash');
  const wc = events.find((e) => e.type === 'worker-crash');
  assert.ok(wc, 'the attribution is a visible spine record');
  assert.equal(wc.category, 'worker-crash');
  assert.ok(wc.files.includes(state), 'the record names the files the worker touched');
  assert.match(String(gaps[1]), /crashed/i, 'the worker is TOLD its edit crashed the suite');
  assert.ok(String(gaps[1]).includes(state), 'and WHICH files it wrote');
  assert.ok(!events.some((e) => e.type === 'escalation'), 'no escalation — this red never was decision-ready');
});

test('F32 control: a crash with ZERO worker writes stays an instrument stop — close-crashed, never retried', async () => {
  const file = join(dir, 'worker-crash-zero-writes.jsonl');
  const outcome = await ralph({
    middle: noop, close: judgedClose(1, 1), capRuns: 3, emit: makeSpine(file), judged: JUDGED,
    workerWrites: () => [], // the audit has no writes: the worker did not do this
  });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated');
  assert.equal(events.find((e) => e.type === 'escalation').category, 'close-crashed');
  assert.equal(events.filter((e) => e.type === 'iteration-start').length, 1, 'an instrument crash is never retried');
  assert.ok(!events.some((e) => e.type === 'worker-crash'), 'nothing to attribute');
});

test('F32: a worker that keeps crashing the suite is bounded by the SAME cap — worker-crash verdicts, cap-halt stop', async () => {
  const file = join(dir, 'worker-crash-cap.jsonl');
  const outcome = await ralph({
    middle: noop, close: judgedClose(1, 1), capRuns: 2, emit: makeSpine(file), judged: JUDGED,
    workerWrites: () => ['/repo/src/broken.js'],
  });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated');
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'cap-halt', 'the stop is a budget story, not a crash story');
  assert.deepEqual(esc.verdicts, ['worker-crash', 'worker-crash'], 'the routed verdict is DISTINCT on the record — never plain crashed, never needs_revision');
});

test('F32: a fake green the worker caused (exit 0, judged nothing, writes exist) is worker-crash — NEVER green', async () => {
  const file = join(dir, 'worker-crash-fake-green.jsonl');
  const outcome = await ralph({
    middle: noop, close: judgedClose(0, 0), capRuns: 1, emit: makeSpine(file), judged: JUDGED,
    workerWrites: () => ['/repo/src/broken.js'],
  });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated', 'cap-halt after the one attempt — but never green');
  assert.ok(events.some((e) => e.type === 'worker-crash'), 'the exit-0 crash is attributed and fed back like any other');
  assert.ok(!events.some((e) => e.type === 'run-end' && e.outcome === 'green'), 'law #8: a green that judged nothing stays not-a-green');
});

test('F32: the gap announces a trimmed file list, never silently truncates it', async () => {
  const file = join(dir, 'worker-crash-many-files.jsonl');
  /** @type {(string|undefined)[]} */
  const gaps = [];
  await ralph({
    middle: (/** @type {number} */ _i, /** @type {string|undefined} */ gap) => gaps.push(gap),
    close: judgedClose(1, 1), capRuns: 2, emit: makeSpine(file), judged: JUDGED,
    workerWrites: () => Array.from({ length: 45 }, (_, i) => `/repo/src/f${i}.js`),
  });
  const g = String(gaps[1]);
  assert.ok(g.includes('/repo/src/f0.js'), 'the head of the list is present');
  assert.match(g, /and 15 more/, 'the trim is announced — silent truncation is the F28 disease');
});

// ─── the kept-failures gap bound (F28) ───────────────────────────────────────
// The gap is the worker's ONLY feedback channel. `boundGap` head/tail-elides a
// big stream, and a large TAP suite prints its `not ok` lines in the MIDDLE — so
// the shell deleted the failing-test NAMES in transit and the worker was told
// "5 fail" and never WHICH. gapKeep (spec-owned) preserves matching lines.

// A ~67KB TAP-like stream with `notOk` failing lines buried dead-centre, well
// past the 400-byte head and 1500-byte tail the bound keeps.
const tapClose = (notOk = 5, lines = 750) => ['node', '-e',
  `const L=[];for(let i=1;i<=${lines};i++){if(i===${Math.floor(lines / 2)}){for(let k=1;k<=${notOk};k++)L.push("not ok "+k+" - notify falsy guard wrongly rejects a valid empty batch, case "+k);}L.push("ok "+i+" - passing subtest number "+i+" in the mailproof suite covering assorted behaviour paths");}console.log(L.join("\\n"));console.log("# tests "+(${lines}+${notOk}));console.log("# pass ${lines}");console.log("# fail "+${notOk});process.exit(1);`];

test('F28: without gapKeep a big TAP stream buries every `not ok` in the elided middle — ZERO reach the gap (the shipped default, locked)', () => {
  const v = runClose(tapClose(5));
  assert.equal(v.verdict, 'needs_revision');
  assert.ok(v.gap.length > 0);
  assert.equal((v.gap.match(/not ok/g) ?? []).length, 0,
    'the failure lines are cut out — this IS the F28 defect, kept as the documented default so the fix is contrastable');
  assert.match(v.gap, /# fail 5/, 'the tail summary still survives (tail-biased bound)');
});

test('F28 fix: gapKeep "^not ok" carries ALL five failure lines verbatim, plus the tail summary and the elision marker', () => {
  const v = runClose(tapClose(5), undefined, { gapKeep: '^not ok' });
  assert.equal(v.verdict, 'needs_revision');
  const kept = v.gap.match(/^not ok \d+ - notify falsy guard/gm) ?? [];
  assert.equal(kept.length, 5, 'every failing test NAME reaches the worker — the causal navigation input (F28)');
  assert.match(v.gap, /# fail 5/, 'the tail summary is still present');
  assert.match(v.gap, /truncated/, 'the head/tail middle is still bounded — gapKeep ADDS to the bound, it does not remove it');
});

test('F28 hazard: failures on STDOUT survive even when STDERR is non-empty — the gap sees BOTH streams', () => {
  // The old `err || out` returned stderr ALONE when it was non-empty, silently
  // losing a stdout-printed failure. Small output (no bounding) — this isolates
  // the stream-combination, not the keep pattern.
  const close = ['node', '-e', 'console.log("not ok 1 - the real failure the worker must see"); console.error("npm warn deprecated something unrelated"); process.exit(1)'];
  const v = runClose(close);
  assert.equal(v.verdict, 'needs_revision');
  assert.match(v.gap, /not ok 1 - the real failure/, 'the stdout failure is not clobbered by stderr noise');
  assert.match(v.gap, /npm warn deprecated/, 'and the stderr noise is still present — both streams, never one');
});

test('F28: the kept-failures block is HARD-capped at 50 lines and ANNOUNCES the trim — a pathological close cannot rebuild the bloat', () => {
  // 200 matching lines fenced by ok filler (so head and tail hold no `not ok` and
  // the count reflects ONLY the keep block). Silent truncation is the disease this
  // fix cures, so a trimmed block must say so.
  const many = ['node', '-e',
    'const L=[];for(let i=1;i<=300;i++)L.push("ok "+i+" - leading filler passing test number "+i);'
    + 'for(let i=1;i<=200;i++)L.push("not ok "+i+" - failing case number "+i+" that must be capped");'
    + 'for(let i=1;i<=300;i++)L.push("ok "+(i+300)+" - trailing filler passing test number "+(i+300));'
    + 'console.log(L.join("\\n"));console.log("# fail 200");process.exit(1)'];
  const v = runClose(many, undefined, { gapKeep: '^not ok' });
  const kept = v.gap.match(/^not ok /gm) ?? [];
  assert.equal(kept.length, 50, `keep block capped at 50 lines, got ${kept.length}`);
  assert.match(v.gap, /more elided/, 'the cap trim is announced with an explicit marker, never silent');
});

test('F28: ralph threads gapKeep into every close it runs — the loop\'s feedback channel carries the failure names', async () => {
  const file = join(dir, 'gapkeep-thread.jsonl');
  const outcome = await ralph({ middle: noop, close: tapClose(3), capRuns: 1, emit: makeSpine(file), gapKeep: '^not ok' });
  const events = readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  assert.equal(outcome, 'escalated');
  const verdict = events.find((e) => e.type === 'close-verdict');
  assert.equal((verdict.gap.match(/^not ok/gm) ?? []).length, 3, 'gapKeep reached runClose through ralph — the failure names are on the spine');
});
