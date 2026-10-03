// Reuse workflow (hamr 2026-10-03) — `workflowKey(spec)`: the identity of a WORKFLOW, one spelling in src/job.js.
// It ignores exactly the fields a reuse may change (source, destination/writeScope, budgetUsd, maxWallMs) and nothing
// else; the signature hash `jobSpecHash` is untouched (it still covers caps and the fence — what the person signs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowKey, jobSpecHash, REUSE_OPEN_SPEC_FIELDS, TOOL_MENU } from '../src/job.js';

const SPEC = {
  schema: 'job-v1', job: 'wk-job', description: 'd', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 },
  budgetUsd: 2, maxWallMs: 600000, writeScope: ['src/'], goal: 'fix things', verdictType: 'green',
  closeDecl: { lang: 'js', stages: [{ name: 'verdict', kind: 'command-exit', params: { cmd: 'node' } }] }, escalation: { mode: 'decision-ready' },
};

test('workflowKey ignores exactly the open fields: source, destination, writeScope, budgetUsd, maxWallMs', () => {
  assert.deepEqual([...REUSE_OPEN_SPEC_FIELDS].sort(), ['budgetUsd', 'destination', 'maxWallMs', 'source', 'writeScope']);
  const k = workflowKey(SPEC);
  assert.match(k, /^[0-9a-f]{64}$/);
  for (const change of [{ budgetUsd: 99 }, { maxWallMs: 1 }, { writeScope: ['lib/', 'docs/'] }, { source: '/x' }, { destination: 'out/' }]) {
    assert.equal(workflowKey({ ...SPEC, ...change }), k, `${Object.keys(change)[0]} is open: same workflow`);
  }
  const { maxWallMs, ...noWall } = SPEC;
  void maxWallMs;
  assert.equal(workflowKey(noWall), k, 'a missing Time cap is still the same workflow');
});

test('workflowKey changes with everything else — goal, checks, model, provider, job name, escalation', () => {
  const k = workflowKey(SPEC);
  for (const change of [
    { goal: 'another' }, { model: 'claude-haiku-4.5' }, { provider: 'deepseek' }, { job: 'other' }, { verdictType: 'soft-green' },
    { closeDecl: { ...SPEC.closeDecl, lang: 'py' } }, { closeDecl: { lang: 'js', stages: [{ name: 'other', kind: 'command-exit', params: { cmd: 'node' } }] } },
    { escalation: { mode: 'other' } }, { description: 'x' },
  ]) {
    assert.notEqual(workflowKey({ ...SPEC, ...change }), k, `${Object.keys(change)[0]} is part of the workflow`);
  }
});

test('workflowKey is not the signature: jobSpecHash still moves with the caps and the fence, and the two never coincide', () => {
  const h = jobSpecHash(SPEC);
  assert.notEqual(jobSpecHash({ ...SPEC, budgetUsd: 3 }), h);
  assert.notEqual(jobSpecHash({ ...SPEC, writeScope: ['lib/'] }), h);
  assert.notEqual(jobSpecHash({ ...SPEC, maxWallMs: 1 }), h);
  assert.notEqual(workflowKey(SPEC), h);
  // a spec carrying none of the open fields would otherwise hash alike: the key is domain-separated
  const bare = { schema: 'job-v1', job: 'x' };
  assert.notEqual(workflowKey(bare), jobSpecHash(bare));
});

test('workflowKey shares jobSpecHash\'s resolved-tools form and never throws', () => {
  assert.equal(workflowKey(SPEC), workflowKey({ ...SPEC, tools: [...TOOL_MENU] }), 'an omitted tools list and the spelled-out menu are one workflow');
  assert.notEqual(workflowKey({ ...SPEC, tools: ['read'] }), workflowKey(SPEC));
  const cyc = { ...SPEC }; cyc.self = cyc;
  assert.match(workflowKey(cyc), /^[0-9a-f]{64}$/);
  for (const bad of [null, undefined, 5, 'x', []]) assert.match(workflowKey(bad), /^[0-9a-f]{64}$/);
});
