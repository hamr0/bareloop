// MCP + tickets piece 3 (R6): the `new-ticket` trigger kind beside `new-file`. {kind:'new-ticket', input:'<label>'} and nothing else: the server, list URL and look tool are
// DERIVED from the signed spec, so the trigger holds nothing the spec does not already sign.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TRIGGER_KINDS, FILE_KINDS, TICKET_KINDS, isTicketTrigger, isFileTrigger, isClockTrigger, validateTrigger,
} from '../src/trigger.js';
import { jobSpecHash, validateJob } from '../src/job.js';

test('new-ticket is a trigger kind of its own: not a file kind, not a clock kind', () => {
  assert.ok(TRIGGER_KINDS.includes('new-ticket'));
  assert.deepEqual([...TICKET_KINDS], ['new-ticket']);
  assert.deepEqual([...FILE_KINDS], ['new-file', 'file-updated'], 'the file kinds stay as they were');
  const t = { kind: 'new-ticket', input: 'issues' };
  assert.equal(isTicketTrigger(t), true);
  assert.equal(isFileTrigger(t), false);
  assert.equal(isClockTrigger(t), false);
  assert.equal(isTicketTrigger({ kind: 'new-file', folder: '/x' }), false);
  assert.equal(isTicketTrigger(null), false);
});

test('validateTrigger takes {kind, input} and returns the typed trigger', () => {
  const v = validateTrigger({ kind: 'new-ticket', input: 'issues' });
  assert.equal(v.ok, true);
  assert.deepEqual(v.trigger, { kind: 'new-ticket', input: 'issues' });
});

test('Must fail: a key beyond kind and input is an unknown-field red; a missing, empty or multi-line input is a red', () => {
  const extra = validateTrigger({ kind: 'new-ticket', input: 'issues', list: 'https://github.com/a/b/issues' });
  assert.equal(extra.ok, false);
  assert.equal(extra.code, 'unknown-field');
  assert.equal(extra.path, 'trigger.list');
  for (const bad of [{ kind: 'new-ticket' }, { kind: 'new-ticket', input: '' }, { kind: 'new-ticket', input: 7 }, { kind: 'new-ticket', input: 'a\nb' }]) {
    const r = validateTrigger(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(r.path, 'trigger.input');
  }
});

test('the existing kinds validate exactly as before', () => {
  assert.equal(validateTrigger({ kind: 'new-file', folder: '/x/in' }).ok, true);
  assert.equal(validateTrigger({ kind: 'daily', hour: 9, minute: 0 }).ok, true);
  assert.equal(validateTrigger({ kind: 'new-file', folder: '/x/in', input: 'a' }).code, 'unknown-field');
  assert.match(validateTrigger({ kind: 'nope' }).say, /new-ticket/);
});

test('a spec carrying a new-ticket trigger validates and its hash moves with the trigger (a schedule is signed)', () => {
  const base = {
    schema: 'job-v1', job: 'tk', description: 'd', provider: 'anthropic-api', model: 'claude-sonnet-5', budgetUsd: 1, maxWallMs: 600000, writeScope: ['output/'],
    goal: 'g', verdictType: 'soft-green', tools: ['read', 'write'], escalation: { mode: 'decision-ready' }, inputs: [{ n: 1, label: 'issues', value: 'https://github.com/a/b/issues' }],
    judge: { provider: 'anthropic-api', model: 'claude-sonnet-5' }, closeDecl: undefined,
  };
  delete base.closeDecl;
  const a = jobSpecHash({ ...base });
  const b = jobSpecHash({ ...base, trigger: { kind: 'new-ticket', input: 'issues' } });
  assert.notEqual(a, b);
  const jv = validateJob({ ...base, trigger: { kind: 'new-ticket', input: 'issues' } }, { shellCapUsd: 1 });
  assert.equal(jv.reds.some((r) => r.path.startsWith('trigger')), false, JSON.stringify(jv.reds));
});
