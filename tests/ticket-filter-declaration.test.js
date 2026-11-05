// borrowed-from: fwdloop test/m12-p3-declaration.test.js@v0.29.0 (ported: bareloop's filter is a top-level signed JOB field; the drafter's proposal is kept beside the close and signed by code)
// MCP + tickets piece 2 (R5): the filter is signed with the job (in the hash), is workflow identity, rides only a Tickets job, shows in code-owned words on the plan card and the
// Job tab, and the draft can never carry it (`assembleSpec` refuses) - the ONLY door is the proposal the drafter made and the person signed (`signFlow`).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { validateJob, jobSpecHash, workflowKey } from '../src/job.js';
import { assembleSpec } from '../src/authorjob.js';
import { signFlow } from '../src/mcppick.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = {
  schema: 'job-v1', job: 'ticket-job', description: 'verify a ticket', provider: 'anthropic-api', budgetUsd: 1.5,
  writeScope: ['src/**'], goal: 'Fix the failing suite.', verdictType: 'green',
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }], tools: ['read', 'grep', 'write', 'edit'], escalation: { mode: 'decision-ready' },
};
const PICK = { server: 'github', tools: ['issue_read'] };

describe('signFlow carries the proposed filter, and only on a Tickets job', () => {
  test('tickets + proposal: signed, legal, in the hash and the workflow key', () => {
    const plain = signFlow(clone(BASE), 'tickets', PICK);
    const filtered = signFlow(clone(BASE), 'tickets', PICK, { priority: ['P1'] });
    assert.deepEqual(filtered.ticketFilter, { priority: ['P1'] });
    assert.equal(validateJob(filtered).ok, true);
    assert.notEqual(jobSpecHash(plain), jobSpecHash(filtered));
    assert.notEqual(workflowKey(plain), workflowKey(filtered), 'a changed filter is a changed workflow');
    assert.equal(Object.hasOwn(plain, 'ticketFilter'), false, 'no proposal = no key (the old hash stands)');
  });
  test('a generic MCP job, a plain job: a stray proposal is never signed', () => {
    assert.equal(Object.hasOwn(signFlow(clone(BASE), 'mcp', PICK, { priority: ['P1'] }), 'ticketFilter'), false);
    assert.deepEqual(signFlow(clone(BASE), 'plain', null, { priority: ['P1'] }), BASE);
  });
  test('the draft cannot carry it: assembleSpec refuses by name', () => {
    assert.throws(() => assembleSpec({ job: 'x', ticketFilter: { priority: ['P1'] } }, { closeDecl: {}, verdictType: 'green' }), /ticketFilter/);
  });
});

describe('the plan card and the Job tab say it in code-owned words', () => {
  const words = 'only tickets with priority P1 run; a closed ticket is skipped';
  test('the signed spec: planFromSpec', () => {
    const spec = signFlow(clone(BASE), 'tickets', PICK, { priority: ['P1'] });
    assert.equal(planFromSpec(spec).ticketFilter, words);
    assert.equal(Object.hasOwn(planFromSpec(clone(BASE)), 'ticketFilter'), false);
  });
  test('the card before signing: planFromConfirm', () => {
    assert.equal(planFromConfirm([], { ticketFilter: { priority: ['P1'] } }).ticketFilter, words);
    assert.equal(Object.hasOwn(planFromConfirm([], {}), 'ticketFilter'), false);
  });
});
