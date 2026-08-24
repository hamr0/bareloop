// runBehaviour/formatBehaviour exit criteria (build-list §2): a report-only
// read of gate-audit records — no gate, no verdict, no spine write. The
// exact-repeat key rule is the load-bearing one (bareloop's own blind-
// instrument history: a collapsed {type,path} key reads two DIFFERENT
// slices of a file as the same action) — this suite mutates the key itself
// to prove the test actually exercises it, not just the happy path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBehaviour, formatBehaviour } from '../src/behaviour.js';

const RUN_A = 'run-aaaa';
const RUN_B = 'run-bbbb';

/** @param {Partial<{run_id:string, type:string, path:string, args:any, decision:string|null}>} o */
function gateRow({ run_id = RUN_A, type = 'read', path = '/x', args = { tool: 'shell_read' }, decision = 'allow' }) {
  return { run_id, phase: 'gate', action: { type, path, args }, decision };
}

/** @param {string} [run_id] */
function llmRow(run_id = RUN_A) {
  return { run_id, phase: 'record', action: { type: 'llm', args: { model: 'claude-sonnet-5' } }, decision: null };
}

test('counts and per-tool breakdown from a realistic fixture', () => {
  const events = [
    llmRow(),
    gateRow({ path: '/a', args: { tool: 'shell_read' } }),
    gateRow({ path: '/b', args: { tool: 'shell_read' } }),
    gateRow({ path: '/c', args: { tool: 'shell_grep' } }),
    gateRow({ type: 'read', path: '/d', args: { tool: 'ctx_recall' } }),
    gateRow({ type: 'edit', path: '/a', args: { bytes: 12 } }),
  ];
  const s = runBehaviour(events);
  assert.equal(s.totalCalls, 5);
  assert.deepEqual(s.byTool, { shell_read: 2, shell_grep: 1, ctx_recall: 1, edit: 1 });
  assert.equal(s.uniquePaths, 4);
  assert.equal(s.denied, 0);
});

test('llm rows are provider rounds, never tool calls — excluded even when frequent', () => {
  const events = [llmRow(), llmRow(), llmRow(), gateRow({ path: '/a' })];
  const s = runBehaviour(events);
  assert.equal(s.totalCalls, 1);
  assert.deepEqual(s.byTool, { shell_read: 1 });
});

test('runId filters a multi-run audit file to just that run', () => {
  const events = [
    gateRow({ run_id: RUN_A, path: '/a' }),
    gateRow({ run_id: RUN_A, path: '/b' }),
    gateRow({ run_id: RUN_B, path: '/c' }),
    gateRow({ run_id: RUN_B, path: '/d' }),
    gateRow({ run_id: RUN_B, path: '/e' }),
  ];
  const a = runBehaviour(events, { runId: RUN_A });
  const b = runBehaviour(events, { runId: RUN_B });
  assert.equal(a.totalCalls, 2);
  assert.equal(b.totalCalls, 3);
  // no runId given: everything counts, across both runs
  assert.equal(runBehaviour(events).totalCalls, 5);
});

test('deny is tallied separately and touches nothing else', () => {
  const events = [
    gateRow({ path: '/a', decision: 'allow' }),
    gateRow({ path: '/secret', decision: 'deny' }),
  ];
  const s = runBehaviour(events);
  assert.equal(s.totalCalls, 1);
  assert.equal(s.denied, 1);
  assert.equal(s.uniquePaths, 1); // the denied path never touched the tree
  assert.equal(formatBehaviour(s).includes('1 denied'), true);
});

test('formatBehaviour omits the denied line entirely when zero', () => {
  const s = runBehaviour([gateRow({ path: '/a' })]);
  assert.equal(s.denied, 0);
  assert.equal(formatBehaviour(s).includes('denied'), false);
});

test('zero-call run formats plainly — no NaN, no divide-by-zero', () => {
  const s = runBehaviour([llmRow()]); // only an llm row: zero tool calls
  assert.equal(s.totalCalls, 0);
  assert.equal(s.repeatPct, null);
  const out = formatBehaviour(s);
  assert.equal(out, '0 tool calls');
  assert.equal(out.includes('NaN'), false);
});

test('formatBehaviour renders the exact agreed shape on a realistic mix', () => {
  const events = [
    ...Array.from({ length: 61 }, (_, i) => gateRow({ path: `/r${i % 40}`, args: { tool: 'shell_read' } })),
    ...Array.from({ length: 28 }, (_, i) => gateRow({ path: `/g${i % 20}`, args: { tool: 'shell_grep' } })),
    ...Array.from({ length: 5 }, (_, i) => gateRow({ path: `/c${i}`, args: { tool: 'ctx_recall' } })),
  ];
  const s = runBehaviour(events);
  assert.equal(s.totalCalls, 94);
  const out = formatBehaviour(s);
  const [first, second] = out.split('\n');
  assert.equal(first, '94 tool calls · 61 read, 28 grep, 5 recall');
  assert.match(second, /^\d+ exact repeats? \(~\d+%\)$/);
});

// ---- the exact-repeat key: MUST be type + path + the WHOLE args object ----

test('same path, DIFFERENT args (e.g. a byte count or an added range) is NOT a repeat', () => {
  const events = [
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 100 } }),
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 4000 } }),
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 100, range: [0, 50] } }),
  ];
  const s = runBehaviour(events);
  assert.equal(s.totalCalls, 3);
  assert.equal(s.repeats, 0);
});

test('byte-identical actions (same type, path, and args) ARE a repeat', () => {
  const events = [
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 100 } }),
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 100 } }),
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 100 } }),
    gateRow({ path: '/other', args: { tool: 'shell_read', bytes: 100 } }),
  ];
  const s = runBehaviour(events);
  assert.equal(s.totalCalls, 4);
  assert.equal(s.repeats, 2); // 3 identical calls = 1 first + 2 repeats
  assert.equal(s.repeatPct, 50);
});

test('key order inside args does not matter — same bag of args is the same key', () => {
  const events = [
    gateRow({ path: '/f', args: { tool: 'shell_read', bytes: 100 } }),
    { ...gateRow({ path: '/f' }), action: { type: 'read', path: '/f', args: { bytes: 100, tool: 'shell_read' } } },
  ];
  const s = runBehaviour(events);
  assert.equal(s.repeats, 1);
});

// Mutation check (reported in the PR/task summary, not asserted here): with the
// key collapsed to `${type} ${path}` — dropping args — the "not a repeat" test
// above (different byte counts on the same path) FAILS, because all three rows
// collapse to one key and register as 2 repeats instead of 0. Restored to the
// full-args key afterward; this comment documents that the check is load-bearing,
// not a smoke test that would pass regardless of what repeatKey does.
