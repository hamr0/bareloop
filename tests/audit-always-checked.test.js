// The Audit lists the job-level `$` rows (defaults, write fence) under "Always checked" without the "other · " prefix, like fwdloop; `checks` holds only line rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFromConfirm, auditChecksOf } from '../src/panel/jobplan.js';

const JOB = [{ n: 1, text: 'fix the bug', rule: null }];
const items = [
  { text: 'does the file exist?', fromLine: [1], by: 'agent', key: 'L1.!a' },
  { text: 'did the run change a file?', fromLine: null, by: 'default', key: 'J.$guard.changed-from-seed', stage: 'changed-from-seed' },
  { text: 'only files in src/ changed?', fromLine: null, by: 'default', key: 'J.$fence' },
];

test('Audit: loose `$` rows move to Always checked, no "other · ", own results kept; the line row stays in Checks', () => {
  const plan = planFromConfirm(JOB, { checkItems: items, protections: [] });
  for (const c of plan.loose) if (c.key?.includes('changed-from-seed')) c.stage = 'changed-from-seed'; // planFromSpec carries the stage; the confirm card does not
  const ac = auditChecksOf(plan, [], new Map([['changed-from-seed', false]]), 2, true);
  assert.deepEqual(ac.checks.map((r) => r.text), ['line 1 · does the file exist?']);
  assert.deepEqual(ac.always.map((r) => r.text), ['did the run change a file?', 'only files in src/ changed?']);
  assert.deepEqual(ac.always.map((r) => r.result), ['failed', 'held']);
  assert.equal(ac.always[1].word, 'held · 2 writes blocked');
  assert.equal(ac.always.some((r) => /^other · /.test(r.text)), false);
});

test('a guard row naming the same signed check as a loose row is shown once (the loose one)', () => {
  const plan = planFromConfirm(JOB, { checkItems: items, protections: [] });
  const ac = auditChecksOf(plan, ['changed-from-seed — x', 'write fence — only src/'], null, 2);
  assert.equal(ac.always.length, 2);
});
