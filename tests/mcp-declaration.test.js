// borrowed-from: fwdloop test/m12-p1-declaration.test.js@ac85780 (ported: bareloop's signed spec carries `mcp`/`flowType`/`ticketFilter`/`ticketWatch` as top-level
// JOB_FIELDS validated by validateJob, not a declaration; the step-level `mcpTools` and the preflight are piece 6, not this rung)
// Written red-first: every test below failed before src/job.js knew the four fields.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { validateJob, jobSpecHash, workflowKey, FLOW_TYPES, flowTypeOf } from '../src/job.js';
import { assembleSpec } from '../src/authorjob.js';
import { WATCHABLE } from '../src/ticketshape.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = {
  schema: 'job-v1', job: 'ticket-job', description: 'verify a ticket', provider: 'anthropic-api', budgetUsd: 1.5,
  writeScope: ['src/**'], goal: 'Fix the failing suite.', verdictType: 'green',
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }], tools: ['read', 'grep', 'write', 'edit'], escalation: { mode: 'decision-ready' },
};
const withMcp = (over = {}) => ({ ...clone(BASE), mcp: { server: 'github', tools: ['issue_read'] }, ...over });
const redsOf = (r) => r.reds.map((x) => `${x.path}: ${x.code} ${x.detail ?? ''}`);

describe('the fields are optional: an old spec does not move', () => {
  test('a real existing spec (mv5bk400 resolved spec) keeps its exact hash and workflow key', () => {
    const s = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'mv5bk400-resolved-spec.json'), 'utf8'));
    // pinned BEFORE this piece was written
    assert.equal(jobSpecHash(s), 'db2333d0a54886349093bb64dc0a4c9a1f263ffe1562de1faf720280fdca640b');
    assert.equal(workflowKey(s), 'fb777a06e2d14c38a9a7a6be9f4c636cd4845d4b81555a60f2c4d62f028fb090');
  });
  test('the base spec validates with none of the four fields', () => { assert.equal(validateJob(BASE).ok, true); });
  test('the field is in the signed hash and the workflow key: adding or changing mcp moves both', () => {
    const a = withMcp();
    assert.notEqual(jobSpecHash(a), jobSpecHash(BASE));
    assert.notEqual(workflowKey(a), workflowKey(BASE));
    const b = withMcp({ mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } });
    assert.notEqual(jobSpecHash(a), jobSpecHash(b));
    assert.notEqual(workflowKey(a), workflowKey(b), 'a changed MCP tool list is a changed workflow');
    const c = withMcp({ mcp: { server: 'other', tools: ['issue_read'] } });
    assert.notEqual(workflowKey(a), workflowKey(c));
  });
  test('ticketFilter / flowType also move the workflow key', () => {
    const a = withMcp({ flowType: 'tickets' });
    assert.notEqual(workflowKey(a), workflowKey(withMcp({ flowType: 'tickets', ticketFilter: { priority: ['P1'] } })));
    assert.notEqual(workflowKey(withMcp()), workflowKey(a));
  });
});

describe('the declaration shape', () => {
  test('mcp {server, tools} alone, with flowType tickets, with filter and watch: valid', () => {
    for (const j of [withMcp(), withMcp({ flowType: 'tickets' }), withMcp({ flowType: 'mcp' }),
      withMcp({ flowType: 'tickets', ticketFilter: { priority: ['P0', 'P1'], labels: ['bug'] }, ticketWatch: ['state', 'labels'] })]) {
      const r = validateJob(j);
      assert.equal(r.ok, true, redsOf(r).join('\n'));
    }
    assert.deepEqual([...FLOW_TYPES], ['plain', 'mcp', 'tickets']);
    assert.deepEqual([...WATCHABLE], ['state', 'labels']);
  });
  test('flowTypeOf: the field; an mcp block with no flowType is a Tickets job; no mcp is plain', () => {
    assert.equal(flowTypeOf(withMcp({ flowType: 'mcp' })), 'mcp');
    assert.equal(flowTypeOf(withMcp()), 'tickets');
    assert.equal(flowTypeOf(BASE), 'plain');
  });
  const bad = [
    ['mcp not an object', (d) => { d.mcp = 'github'; }, 'mcp'],
    ['mcp.server empty', (d) => { d.mcp.server = ''; }, 'mcp.server'],
    ['mcp.server not a plain name', (d) => { d.mcp.server = 'git hub;rm'; }, 'mcp.server'],
    ['mcp.tools empty', (d) => { d.mcp.tools = []; }, 'mcp.tools'],
    ['mcp.tools has a duplicate', (d) => { d.mcp.tools = ['issue_read', 'issue_read']; }, 'issue_read'],
    ['mcp.tools has a blank name', (d) => { d.mcp.tools = ['']; }, 'mcp.tools'],
    ['mcp has an unknown key', (d) => { d.mcp.allowAll = true; }, 'allowAll'],
    ['flowType not one of three', (d) => { d.flowType = 'email'; }, 'flowType'],
    ['flowType plain with an mcp block', (d) => { d.flowType = 'plain'; }, 'flowType'],
    ['flowType tickets with no mcp', (d) => { d.flowType = 'tickets'; delete d.mcp; }, 'flowType'],
    ['ticketFilter on a generic mcp job', (d) => { d.flowType = 'mcp'; d.ticketFilter = { priority: ['P1'] }; }, 'ticketFilter'],
    ['ticketWatch on a generic mcp job', (d) => { d.flowType = 'mcp'; d.ticketWatch = ['state']; }, 'ticketWatch'],
    ['ticketFilter with no mcp', (d) => { delete d.mcp; d.ticketFilter = { priority: ['P1'] }; }, 'ticketFilter'],
    ['ticketFilter empty object', (d) => { d.ticketFilter = {}; }, 'ticketFilter'],
    ['ticketFilter unknown key', (d) => { d.ticketFilter = { state: ['open'] }; }, 'state'],
    ['ticketFilter priority P9', (d) => { d.ticketFilter = { priority: ['P9'] }; }, 'P9'],
    ['ticketFilter labels duplicate (case-blind)', (d) => { d.ticketFilter = { labels: ['bug', 'BUG'] }; }, 'BUG'],
    ['ticketFilter labels empty list', (d) => { d.ticketFilter = { labels: [] }; }, 'ticketFilter.labels'],
    ['ticketWatch empty', (d) => { d.ticketWatch = []; }, 'ticketWatch'],
    ['ticketWatch names assignee', (d) => { d.ticketWatch = ['assignee']; }, 'assignee'],
    ['ticketWatch duplicate', (d) => { d.ticketWatch = ['state', 'state']; }, 'state'],
    ['ticketWatch with no mcp', (d) => { delete d.mcp; d.ticketWatch = ['state']; }, 'ticketWatch'],
  ];
  for (const [name, mutate, needle] of bad) {
    test(`refused: ${name}`, () => {
      const d = withMcp();
      mutate(d);
      const r = validateJob(d);
      assert.equal(r.ok, false, 'expected a red');
      assert.ok(redsOf(r).some((x) => x.includes(needle)), `want a red naming ${needle}, got:\n${redsOf(r).join('\n')}`);
    });
  }
});

describe('assembleSpec: the agent never sets them', () => {
  const authored = { closeDecl: { stages: [] }, verdictType: 'green' };
  for (const f of ['mcp', 'flowType', 'ticketFilter', 'ticketWatch']) {
    test(`a draft carrying ${f} is refused by name`, () => {
      assert.throws(() => assembleSpec({ goal: 'x', [f]: f === 'mcp' ? { server: 'github', tools: ['issue_read'] } : 'x' }, authored), new RegExp(`carries ${f}`));
    });
  }
  test('a draft without them assembles as before', () => {
    assert.equal(assembleSpec({ goal: 'x' }, authored).goal, 'x');
  });
});
