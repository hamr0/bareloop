// borrowed-from: fwdloop test/m13-p2-step-tools.test.js@a701e58 (re-shaped: fwd's runFlow/resolvePrimitives is bareloop's validatePlan + planPrompt + runPlan worker build; fwd's canrun.js findMcpPlanRed lives in validatePlan)
// MCP + tickets piece 6, R2c: a plan step may call only the MCP tools the job signed (`mcpTools`, a subset of `mcp.tools`), validated at $0 before any token
// (stray tool = verb-escape; a generic MCP job with no calling step = red; a Tickets job's own issue_read/list_issues need no step), and the drafter is told.
// Real: validatePlan, planPrompt. The worker half (real bridge, real Gate, a scripted provider, no network) is in the later sections of this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan } from '../src/plan.js';
import { planPrompt } from '../src/planrun.js';

const JOB = {
  schema: 'job-v1', job: 'ticket-fix', description: 'fix what a ticket reports', provider: 'anthropic-api', cadence: { unit: 'week', every: 1 }, budgetUsd: 1.8,
  writeScope: ['tests/**'], goal: 'Write a test that covers what the ticket reports.', verdictType: 'green',
  close: [
    { name: 'clean-run', cmd: 'python -m pytest -ra tests/test_x.py', expect: 0, gapKeep: '^FAILED', sha256: 'a'.repeat(64) },
    { name: 'verdict', cmd: 'python grade.py', expect: 0, sha256: 'a'.repeat(64) },
  ],
  tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
};
const MCP = { server: 'github', tools: ['issue_read', 'list_issues', 'add_issue_comment'] };
const step = (over = {}) => ({
  id: 'look', action: 'Look the ticket up and write notes.', tools: ['read', 'write'], rounds: 6, target: 'tests/notes.md',
  exit: [{ type: 'artifact-written', path: 'tests/notes.md' }], ...over,
});
const plan = (...steps) => ({ schema: 'plan-v1', steps });
const reds = (job, p) => validatePlan(p, { job }).reds;

test('a step granting a subset of the job\'s mcp tools validates', () => {
  const v = validatePlan(plan(step({ mcpTools: ['issue_read'] })), { job: { ...JOB, mcp: MCP, flowType: 'mcp' } });
  assert.deepEqual(v.reds, []);
  assert.equal(v.ok, true);
});

test('a step naming a tool outside the signed list is exactly one verb-escape red naming the tool and the legal values', () => {
  const r = reds({ ...JOB, mcp: MCP, flowType: 'mcp' }, plan(step({ mcpTools: ['issue_read', 'delete_repo'] })));
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'verb-escape');
  assert.equal(r[0].path, 'steps.0.mcpTools');
  assert.equal(r[0].verb, 'delete_repo');
  assert.match(r[0].detail, /delete_repo/);
  assert.match(r[0].detail, /issue_read, list_issues, add_issue_comment/, 'the red hands over the legal values');
  assert.match(r[0].detail, /"mcpTools": \["issue_read"\]/, 'and a legal example');
});

test('a Tickets job (an mcp block, no flowType) is stray-checked too', () => {
  const r = reds({ ...JOB, mcp: MCP }, plan(step({ mcpTools: ['nope'] })));
  assert.deepEqual(r.map((x) => x.code), ['verb-escape']);
});

test('mcpTools on a job that signed no mcp server is a verb-escape, not silently inert', () => {
  const r = reds(JOB, plan(step({ mcpTools: ['issue_read'] })));
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'verb-escape');
  assert.match(r[0].detail, /no MCP server/);
});

for (const [label, bad] of [['empty', []], ['a duplicate', ['issue_read', 'issue_read']], ['a non-string', [7]], ['not a list', 'issue_read']]) {
  test(`mcpTools that is ${label} is an invalid-value red`, () => {
    const r = reds({ ...JOB, mcp: MCP }, plan(step({ mcpTools: bad })));
    assert.deepEqual(r.map((x) => x.code), ['invalid-value']);
    assert.equal(r[0].path, 'steps.0.mcpTools');
  });
}

test('a generic MCP job (flowType mcp) with no step granting one of its tools is red', () => {
  const r = reds({ ...JOB, mcp: MCP, flowType: 'mcp' }, plan(step()));
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'missing-required');
  assert.equal(r[0].path, 'steps');
  assert.match(r[0].detail, /github/);
  assert.match(r[0].detail, /"mcpTools": \["issue_read"\]/);
});

test('a Tickets job\'s own tools need no calling step', () => {
  assert.deepEqual(reds({ ...JOB, mcp: { server: 'github', tools: ['issue_read', 'list_issues'] }, flowType: 'tickets' }, plan(step())), []);
  assert.deepEqual(reds({ ...JOB, mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } }, plan(step())), []);
});

test('a plain job is unchanged: no mcp block, no mcpTools, no new red', () => {
  assert.deepEqual(reds(JOB, plan(step())), []);
});

test('the drafter prompt tells the planner about mcpTools and its legal values; a plain job\'s prompt does not mention it', () => {
  const withMcp = planPrompt({ ...JOB, mcp: MCP, flowType: 'mcp' }, 'scout', null, 40, null, null, null);
  assert.match(withMcp, /"mcpTools"/);
  assert.match(withMcp, /\["issue_read","list_issues","add_issue_comment"\]/, 'the legal values are the job\'s signed tools');
  assert.match(withMcp, /"mcpTools":\s*\["issue_read"\]/, 'a legal example rides with the rule');
  assert.match(withMcp, /at least one step/, 'a generic job is told a step must call a tool');
  const tickets = planPrompt({ ...JOB, mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } }, 'scout', null, 40, null, null, null);
  assert.match(tickets, /"mcpTools"/);
  assert.doesNotMatch(tickets, /at least one step/, 'a Tickets job\'s own tools need no step, so it is not told that');
  assert.doesNotMatch(planPrompt(JOB, 'scout', null, 40, null, null, null), /mcpTools/);
});
