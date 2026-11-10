// borrowed-from: fwdloop src/ticket-draft.js mcpFactsLines@0db1736 (the line "the job's server and tool list are set by the program, not by you" and the rule to use the exact tool name; R2c already tells the planner the tools, the legal values and a legal example)
// ITEM33-BUILD piece 8: the planner is told the flow type's facts. A validator rule the drafter is not told about fails every draft, so the sentence rides WITH the legal example. A plain job's prompt does not move.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPrompt } from '../src/planrun.js';
import { validatePlan } from '../src/plan.js';

const JOB = {
  schema: 'job-v1', job: 'ticket-fix', description: 'd', provider: 'anthropic-api', cadence: { unit: 'week', every: 1 }, budgetUsd: 1.8, writeScope: ['tests/**'], goal: 'Write a test.', verdictType: 'green',
  close: [{ name: 'verdict', cmd: 'python grade.py', expect: 0, sha256: 'a'.repeat(64) }], tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
};
const MCP = { server: 'github', tools: ['issue_read', 'list_issues', 'add_issue_comment'] };
const prompt = (job) => planPrompt(job, 'scout', null, 40, null, null, null);

test('an MCP or Tickets job\'s planner is told the program set the server and tool list, to use the exact tool name, and is shown a legal example', () => {
  for (const flowType of ['mcp', 'tickets']) {
    const p = prompt({ ...JOB, mcp: MCP, flowType });
    assert.match(p, /The job's server and tool list were set by the program, not by you, and the plan has no field for them\./, flowType);
    assert.match(p, /using the exact tool name above/, flowType);
    assert.match(p, /Example: "mcpTools": \["issue_read"\]/, flowType);
  }
});

test('the plan has no field for the server or the tools: a plan that tries to carry "mcp" or "flowType" is refused, so the sentence is true', () => {
  const step = { id: 'look', action: 'Look.', tools: ['read', 'write'], rounds: 6, target: 'tests/notes.md', exit: [{ type: 'artifact-written', path: 'tests/notes.md' }] };
  for (const extra of [{ mcp: MCP }, { flowType: 'mcp' }]) {
    const r = validatePlan({ schema: 'plan-v1', steps: [step], ...extra }, { job: { ...JOB, mcp: MCP, flowType: 'mcp' } });
    assert.equal(r.ok, false, JSON.stringify(extra));
  }
});

test('a plain job\'s prompt is untouched: none of the MCP words', () => {
  const p = prompt(JOB);
  assert.doesNotMatch(p, /mcpTools|set by the program|MCP/);
});
