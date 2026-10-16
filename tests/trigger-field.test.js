// T Part 3 (PANEL-BUILD.md T addendum, G.3): the `trigger` field of the signed spec. Mirrors fwd m9-trigger-grammar
// for a JSON spec: every shape, unknown nested key red, `cadence` tolerated, by-hand hashes unchanged, workflowKey
// ignores trigger, a draft carrying trigger refused by name, the interview/session no longer write cadence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { validateJob, jobSpecHash, workflowKey } from '../src/job.js';
import { validateTrigger, TRIGGER_KINDS } from '../src/trigger.js';
import { assembleSpec } from '../src/authorjob.js';
import { specOf } from './trigger-world.mjs';

const reds = (spec) => validateJob(spec, { shellCapUsd: spec.budgetUsd }).reds.map((r) => `${r.code}:${r.path}`);
const withT = (t) => ({ ...specOf(), trigger: t });

test('every trigger shape validates; kinds are the five', () => {
  assert.deepEqual([...TRIGGER_KINDS], ['daily', 'weekdays', 'weekly', 'new-file', 'file-updated']);
  for (const t of [
    { kind: 'daily', hour: 9, minute: 5 }, { kind: 'weekdays', hour: 0, minute: 0 },
    { kind: 'weekly', day: 'mon', hour: 23, minute: 59 }, { kind: 'new-file', folder: '/home/u/inbox' }, { kind: 'file-updated', path: '/home/u/data.csv' },
  ]) {
    assert.deepEqual(reds(withT(t)), [], JSON.stringify(t));
    assert.deepEqual(validateTrigger(t), { ok: true, trigger: t });
  }
});

test('bad shapes are red by name: cron text, unknown kind, relative path, newline, bad hour, unknown nested key', () => {
  const bad = [
    ['*/5 * * * *', 'invalid-value:trigger'], [{ kind: 'hourly' }, 'invalid-value:trigger.kind'],
    [{ kind: 'daily', hour: 24, minute: 0 }, 'invalid-value:trigger'], [{ kind: 'daily', hour: 9, minute: 0, cron: 'x' }, 'unknown-field:trigger.cron'],
    [{ kind: 'new-file', folder: 'inbox' }, 'invalid-value:trigger.folder'], [{ kind: 'new-file', folder: '/a\n/b' }, 'invalid-value:trigger.folder'],
    [{ kind: 'new-file', folder: '/a', role: 'x' }, 'unknown-field:trigger.role'], [{ kind: 'file-updated', path: '/a', folder: '/b' }, 'unknown-field:trigger.folder'],
    [{ kind: 'weekly', hour: 9, minute: 0 }, 'invalid-value:trigger'], [null, 'invalid-value:trigger'], [[], 'invalid-value:trigger'],
  ];
  for (const [t, want] of bad) assert.ok(reds(withT(t)).includes(want), `${JSON.stringify(t)} -> ${reds(withT(t))}`);
});

test('cadence is tolerated and ignored: absent is fine, present is still validated, old signed specs keep their hash', () => {
  const plain = specOf();
  assert.deepEqual(reds(plain), [], 'no cadence at all is a valid spec');
  const old = { ...plain, cadence: { unit: 'day', every: 1 } };
  assert.deepEqual(reds(old), []);
  assert.ok(reds({ ...plain, cadence: { unit: 'day', every: 0 } }).includes('bounds:cadence.every'));
  assert.ok(reds({ ...plain, cadence: { unit: 'day', every: 1, x: 1 } }).includes('unknown-field:cadence.x'));
  // an old spec's cadence is still part of what was signed (its hash is unchanged by this build), and nothing is injected for trigger
  assert.notEqual(jobSpecHash(old), jobSpecHash(plain), 'cadence still counts in the hash of a spec that has it');
  assert.equal(jobSpecHash(old), jobSpecHash(JSON.parse(JSON.stringify(old))));
});

test('by hand is the ABSENT key: a by-hand spec hashes without trigger; setting one changes the hash', () => {
  const plain = specOf();
  assert.equal('trigger' in plain, false);
  assert.notEqual(jobSpecHash(withT({ kind: 'daily', hour: 9, minute: 0 })), jobSpecHash(plain));
  assert.notEqual(jobSpecHash(withT({ kind: 'daily', hour: 9, minute: 0 })), jobSpecHash(withT({ kind: 'daily', hour: 9, minute: 1 })), 'the time is covered by the signature');
});

test('workflowKey ignores trigger (a scheduled spec keeps its green run\'s key) but still sees the goal', () => {
  const plain = specOf();
  assert.equal(workflowKey(withT({ kind: 'daily', hour: 9, minute: 0 })), workflowKey(plain));
  assert.equal(workflowKey(withT({ kind: 'new-file', folder: '/x' })), workflowKey(withT({ kind: 'daily', hour: 1, minute: 1 })));
  assert.notEqual(workflowKey({ ...plain, goal: 'something else' }), workflowKey(plain));
});

test('assembleSpec refuses a draft carrying trigger, by name; the same draft without it folds', () => {
  const draft = { schema: 'job-v1', job: 'x' };
  assert.throws(() => assembleSpec({ ...draft, trigger: { kind: 'daily', hour: 9, minute: 0 } }, { closeDecl: { stages: [] }, verdictType: 'green' }), /carries trigger/);
  assert.equal(assembleSpec(draft, { closeDecl: { stages: [] }, verdictType: 'green' }).job, 'x');
});

test('the panel session and the interview no longer write cadence (they write nothing in its place)', () => {
  for (const f of ['../src/panel/authorsession.js', '../src/interviewrun.js']) {
    const text = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.equal(/cadence:\s*\{/.test(text), false, `${f} still writes cadence`);
    assert.equal(/\btrigger:\s*\{/.test(text), false, `${f} writes a trigger`);
  }
});
