// The public surface IS the adopter contract, and the contract is a document
// (`bareloop.context.md` + the CHANGELOG) that can drift ahead of `src/index.js`
// silently — an adopter finds out by importing a name that isn't there.
//
// This pins the names those documents name. It is deliberately a NAME check, not
// a behavior check: each export's semantics are owned by its own module's tests
// (job.test.js, plan.test.js, ralph.test.js); what has no other owner is the
// question "does the shipped index still hand this out?".
//
// Review 2026-07-30 (S9) found three documented-but-unexported names — `runStages`
// (CHANGELOG announces it async beside `runClose`), `checkMenu` (the context doc
// points adopters at it by name), and `STORE_VERBS` (CHANGELOG announces it as
// half of a split with the already-exported `WRITE_VERBS`). Exporting them made
// the documents true; this test keeps them that way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bareloop from '../src/index.js';

test('the documented public surface is actually exported from src/index.js', () => {
  // Named in bareloop.context.md / CHANGELOG.md as adopter-reachable API.
  const documented = [
    'makeSpine',
    'ralph', 'runClose', 'runStages', 'CLOSE_FAULTS',
    'globToPrefix', 'scanSecrets',
    'validateJob', 'jobSpecHash', 'checkApproval', 'checkMenu',
    'CLOSE_TYPES', 'CLASS_BY_CLOSE', 'GOLD_COMPARE', 'CADENCE_UNITS', 'PROVIDERS',
    'CONDITION_KEYS', 'TOOL_MENU', 'LOCKED_TOOLS', 'VERDICT_TYPES', 'LOCKED_VERDICTS',
    'WRITE_VERBS', 'STORE_VERBS',
    'validatePlan', 'EXIT_TYPES', 'MAX_EXITS_PER_STEP', 'MAX_PLAN_STEPS',
    'snapshotScope', 'evalExits',
    'runPlan', 'runJob',
    'classifyIncidents', 'foldLedger', 'ledgerDeltas', 'updateLedger', 'LEDGER_CLASSES',
  ];
  const missing = documented.filter((n) => bareloop[n] === undefined);
  assert.deepEqual(missing, [], `documented but not exported — the adopter contract is false: ${missing.join(', ')}`);
});

test('the three names S9 found missing are the shapes the docs promise', () => {
  // `runStages` is announced as async (F68) alongside `runClose`; a Promise-returning
  // function is the whole breaking change adopters were told about.
  assert.equal(typeof bareloop.runStages, 'function');
  assert.equal(typeof bareloop.runClose, 'function');
  assert.equal(bareloop.runStages.constructor.name, 'AsyncFunction');
  assert.equal(bareloop.runClose.constructor.name, 'AsyncFunction');

  // `checkMenu` derives the offerable stages from a validated staged close.
  assert.equal(typeof bareloop.checkMenu, 'function');
  assert.deepEqual(bareloop.checkMenu('not a close'), [], 'tolerates a non-list rather than throwing at an adopter');

  // WRITE_VERBS / STORE_VERBS ship as a pair, both frozen — neither class is
  // read-capable, which is why the scout is granted neither.
  assert.deepEqual(bareloop.STORE_VERBS, ['stash', 'remember', 'forget']);
  assert.ok(Object.isFrozen(bareloop.STORE_VERBS), 'a mutable menu export would let adopter code edit the fence');
  assert.deepEqual(bareloop.WRITE_VERBS, ['write', 'edit']);
  assert.ok(Object.isFrozen(bareloop.WRITE_VERBS));
});
