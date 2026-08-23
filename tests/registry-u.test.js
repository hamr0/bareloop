// THE U RUNNER'S REGISTRY ROW (2B) — making the door's promise true.
//
// The review door tells a person that `accept` "releases this run's learning
// credit". For every run `scripts/run-u.mjs` has ever driven that sentence was
// false by construction: a cold green wrote a standalone `bridge-<job>-<runid>.json`
// FILE and never a registry ROW, so `--registry --workflow --decide accept` reached
// `recordDoor`, found no green row for the runid, and died `no-row-for-run`. The
// held credit could be described and never released.
//
// WHAT IS UNDER TEST is the storage half only — bridge SELECTION, promotion and
// reuse execution stay parked (layer-3-reuse). Two promises:
//
//   - THE ROW IS MINTED THROUGH THE EXISTING SPELLING. `writeGreenRow` is the
//     cold-leg green write lifted out of `runReuse` unchanged, so the U runner and
//     the reuse runner mint a green the same way — including the fork-on-a-
//     different-close-shape rule and the two refusals that protect an unreadable
//     file. A second spelling of "what a green writes" is the two-transforms class
//     applied to the ledger itself, which is exactly what module 1 exists to stop.
//   - THE HOLD AND THE RELEASE ARE ONE MECHANISM. The row is born `quarantined`
//     because `greenParts` reads the class off the record (module 6), never because
//     this runner set a flag; and `applyDoorDecision` releases it through the path
//     that already existed.
//
// AND EVERY GUARD THE RUNNER ALREADY HAD SURVIVES: an already-green run mints
// nothing (the reuse-credit leak block, from the other side), a green-class run
// mints nothing here (main's behaviour, kept — the U runner has never written a
// registry row for one), and no `--registry` writes nothing at all.
//
// The door TEXT is tested beside them, because the promise and the thing that
// makes it true have to move together: with no row minted, the accept line must
// not promise a release.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeGreenRow, writeRunGreenRow, applyDoorDecision } from '../src/reuse.js';
import { makeRegistry, loadBridge } from '../src/bridges.js';
import { runDoorLines } from '../scripts/u-readout.mjs';

const base = mkdtempSync(join(tmpdir(), 'registry-u-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;
const registry = () => {
  const dir = join(base, `r${n += 1}`);
  makeRegistry(dir);
  return dir;
};

const PLAN = { schema: 'plan-v1', steps: [{ id: 'fix', tools: ['read', 'write'] }] };

/** the job spec a U run was signed under. `verdictType` is the only knob these
 * tests turn — it is what decides both whether a row is minted here and whether
 * the row that is minted is HELD. */
const job = (verdictType = 'soft-green') => ({
  schema: 'job-v1',
  job: 'judged-patient',
  goal: 'Document every exported function in src/.',
  budgetUsd: 5,
  verdictType,
  closeDecl: {
    genre: 'types',
    lang: 'js',
    stages: [
      { name: 'changed-from-seed', kind: 'files-changed', params: {} },
      { name: 'docs-read-well', kind: 'judged-floor', params: {} },
    ],
  },
});

/** what the runner knows about the run it just finished */
const record = (over = {}) => ({
  runid: 'u-abc123',
  patient: '/tmp/patient',
  at: '2026-08-23T10:00:00.000Z',
  plan: PLAN,
  costUsd: 1.25,
  spendComplete: true,
  wallMs: 600_000,
  rounds: 12,
  specHash: 'deadbeef',
  ...over,
});

const rowsOf = (dir, name) => {
  const f = join(dir, `${name}.json`);
  if (!existsSync(f)) return null;
  const l = loadBridge(f);
  assert.equal(l.ok, true, JSON.stringify(l.reds));
  return l.bridge;
};

// ── 1. THE MINT ──────────────────────────────────────────────────────────────

test('a soft-green GREEN with a registry mints ONE row for that runid, and it is born HELD', () => {
  const dir = registry();
  const w = writeRunGreenRow({ registryDir: dir, job: job(), name: null, outcome: 'green', plan: PLAN, record: record() });

  assert.equal(w.minted, true, JSON.stringify(w));
  assert.equal(w.write.action, 'mint');
  assert.deepEqual(w.write.reds, []);

  const b = rowsOf(dir, 'judged-patient');
  assert.equal(b.history.length, 1);
  assert.equal(b.history[0].runid, 'u-abc123');
  assert.equal(b.history[0].outcome, 'green');
  assert.equal(b.history[0].quarantined, true, 'a judged green is HELD until a person releases it');
  assert.equal(b.versions.length, 1);
  assert.equal(b.versions[0].quarantined, true, 'both halves of the one fact');
  assert.deepEqual(b.versions[0].plan, PLAN, 'the artifact that inherits is the one that RAN');
  assert.deepEqual(b.closeStageNames, ['changed-from-seed', 'docs-read-well']);
});

test('and the door ACCEPT releases it — the promise the runner prints is now true', () => {
  const dir = registry();
  writeRunGreenRow({ registryDir: dir, job: job(), name: null, outcome: 'green', plan: PLAN, record: record() });

  const r = applyDoorDecision({ registryDir: dir, name: 'judged-patient', runid: 'u-abc123', decision: 'accept', at: '2026-08-23T11:00:00.000Z' });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.released, true);

  const b = rowsOf(dir, 'judged-patient');
  assert.equal(b.history[0].quarantined, false, 'released — a flag, never a deletion');
  assert.equal(b.versions[0].quarantined, false);
  assert.deepEqual(b.history[0].doors, [{ decision: 'accept', at: '2026-08-23T11:00:00.000Z' }]);
});

// ── 2. EVERY GUARD THAT WAS ALREADY THERE ───────────────────────────────────

test('NO registry, NO row — the registry is operator-supplied and is never conjured', () => {
  const w = writeRunGreenRow({ registryDir: null, job: job(), name: null, outcome: 'green', plan: PLAN, record: record() });
  assert.equal(w.minted, false);
  assert.equal(w.reason, 'no-registry');
});

test('an ALREADY-GREEN run mints NOTHING — accept confirms a verdict, it never mints one', () => {
  const dir = registry();
  const w = writeRunGreenRow({ registryDir: dir, job: job(), name: null, outcome: 'already-green', plan: PLAN, record: record() });
  assert.equal(w.minted, false);
  assert.equal(w.reason, 'green-predates-run');
  assert.equal(rowsOf(dir, 'judged-patient'), null, 'nothing on disk at all');
});

test('a GREEN-CLASS run mints nothing here — this runner has never written one, and that stands', () => {
  const dir = registry();
  const w = writeRunGreenRow({ registryDir: dir, job: job('green'), name: null, outcome: 'green', plan: PLAN, record: record() });
  assert.equal(w.minted, false);
  assert.equal(w.reason, 'credit-not-held');
  assert.equal(rowsOf(dir, 'judged-patient'), null);
});

test('a green with NO PLAN on the spine mints nothing — the artifact that inherits is the one that ran', () => {
  const dir = registry();
  const w = writeRunGreenRow({ registryDir: dir, job: job(), name: null, outcome: 'green', plan: null, record: record({ plan: null }) });
  assert.equal(w.minted, false);
  assert.equal(w.reason, 'no-plan-executed');
  assert.equal(rowsOf(dir, 'judged-patient'), null);
});

// ── 3. THE SHARED SPELLING ──────────────────────────────────────────────────

test('writeGreenRow is the SAME cold-leg write reuse uses: a second green of one shape APPENDS', () => {
  const dir = registry();
  const meta = { name: 'judged-patient', goal: 'g', specHash: 'deadbeef', closeStageNames: ['a', 'b'], toolsUsed: ['read'] };
  const first = writeGreenRow({ registryDir: dir, bridge: null, meta, record: { ...record(), verdictType: 'soft-green' } });
  assert.equal(first.action, 'mint');
  const second = writeGreenRow({ registryDir: dir, bridge: null, meta, record: { ...record({ runid: 'u-def456' }), verdictType: 'soft-green' } });
  assert.equal(second.action, 'appendGreen', 'another version of the same workflow, never a clobber');

  const b = rowsOf(dir, 'judged-patient');
  assert.equal(b.versions.length, 2);
  assert.equal(b.history.length, 2);
});

test('writeGreenRow FORKS a green whose close is a different shape — never appends across two closes', () => {
  const dir = registry();
  const meta = (closeStageNames) => ({ name: 'judged-patient', goal: 'g', specHash: 'deadbeef', closeStageNames, toolsUsed: ['read'] });
  writeGreenRow({ registryDir: dir, bridge: null, meta: meta(['a', 'b']), record: { ...record(), verdictType: 'soft-green' } });
  const forked = writeGreenRow({ registryDir: dir, bridge: null, meta: meta(['a', 'c']), record: { ...record({ runid: 'u-def456' }), verdictType: 'soft-green' } });

  assert.equal(forked.action, 'mint-shape-forked');
  assert.equal(forked.shapeForked, true);
  assert.equal(forked.forkedFrom, 'judged-patient');
  assert.notEqual(forked.name, 'judged-patient');
  assert.equal(rowsOf(dir, 'judged-patient').history.length, 1, 'the first entry is untouched');
});

// ── 4. THE PROMISE ITSELF ───────────────────────────────────────────────────

test('the accept door promises a CREDIT RELEASE only when a row is actually held', () => {
  const cmds = { rerun: 'r', accept: 'a', pause: 'p', ttlDays: 60 };
  const held = runDoorLines({ ...cmds, held: true }).join('\n');
  const bare = runDoorLines({ ...cmds, held: false }).join('\n');
  assert.match(held, /releases this run's learning credit/);
  assert.doesNotMatch(bare, /learning credit/, 'with nothing held there is nothing to release, and the door must not say there is');
});

test('a judged green with NO registry named leaves nothing to release, so the door does not promise one', () => {
  // this is the state 2B closed: the run is soft-green and its verdict IS held in
  // spirit, but the operator named no registry, so no row exists for a door to act
  // on. `held` is the RUNNER's answer to "is there something to release", and it is
  // read off whether a row was minted — never off the verdict class alone.
  const w = writeRunGreenRow({ registryDir: null, job: job(), name: null, outcome: 'green', plan: PLAN, record: record() });
  const lines = runDoorLines({ rerun: 'r', accept: 'a', pause: 'p', ttlDays: 60, held: w.minted }).join('\n');
  assert.doesNotMatch(lines, /learning credit/);
});
