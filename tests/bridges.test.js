// Layer 3 REUSE, modules 1+2 (design record docs/plans/2026-08-01-layer-3-reuse-design.md).
//
// Module 1 is the registry (D1 storage + D6 status/history): a directory of plain
// JSON files, one per bridge, operator-supplied path. Module 2 is the LOAD GATE
// (D2 as SPLIT by the 2026-08-01 addendum): three shape checks and nothing else —
// paths/scopes/targets are instance-bound and are EXPECTED to red at draft time,
// where the full validatePlan judges the tweaked draft (the pre-probe measured the
// drafter fixing them unaided, 3/3).
//
// The load-bearing rules under test, each traced to its ruling:
//  - R1: a red NEVER touches versions — only a green writes the box.
//  - D6: status is DERIVED, never stored; a red on a PROVEN demotes to candidate;
//    a casualty is not a red (provider-red rows are casualties, never evidence).
//  - F6: an unknown cost/time is null and stays null — never defaulted to 0, and
//    an aggregate that skips nulls says how many it skipped.
//  - MED-1: an omitted `tools` means the CONCRETE current TOOL_MENU (the same
//    predicate resolveSpec/plan.js read), so the gate reads the signed ceiling.
//
// Style follows tests/job.test.js: table-driven mutators over ONE base fixture,
// exactly one red per case (a case that trips a second red is a table bug — "some
// red somewhere" lets a wrong-reason red fake a pass).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateJob, TOOL_MENU } from '../src/job.js';
import {
  BRIDGE_SCHEMA, deriveStatus, validateBridge, loadBridge, loadRegistry,
  mintBridge, appendGreen, appendRed, saveBridge, listingRow, loadGate,
} from '../src/bridges.js';

const clone = (/** @type {any} */ o) => JSON.parse(JSON.stringify(o));
const mut = (/** @type {any} */ base, /** @type {(o: any) => void} */ fn) => { const c = clone(base); fn(c); return c; };
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

// The real shape of a minted plan (an abridged copy of the litectx-u bridge on disk).
const PLAN = {
  schema: 'plan-v1',
  steps: [
    { id: 'annotate-exports', action: 'Add explicit return types to the exported functions in src/.', tools: ['read', 'grep', 'edit'], rounds: 12, target: 'src', exit: [{ type: 'tree-changed', scope: 'src/**' }] },
    { id: 'clear-strict-errors', action: 'Fix the remaining strict-mode errors without weakening the tests.', tools: ['read', 'grep', 'edit'], rounds: 20, target: 'src', exit: [{ type: 'check-passes', name: 'typecheck' }] },
  ],
};

const STAGES = ['changed-from-seed', 'typecheck', 'suite-green', 'no-suppressions'];

/** the base bridge — one green, so it sits exactly at D6's entry bar */
const BRIDGE = {
  schema: 'bridge-v1',
  name: 'litectx-u-types',
  goal: 'Make litectx pass tsc --strict without weakening the tests.',
  specHash: '037fa93719a708379502e320023d44cbf3b56e3096c8242793241c3e097e16e3',
  closeStageNames: [...STAGES],
  toolsUsed: ['read', 'grep', 'edit'],
  versions: [{ plan: PLAN, runid: 'ms3wawub', greenAt: '2026-07-28T00:43:12.451Z', patient: 'litectx-u', costUsd: 2.47, wallMs: 534_000, rounds: 41 }],
  history: [{ at: '2026-07-28T00:43:12.451Z', runid: 'ms3wawub', patient: 'litectx-u', outcome: 'green', failingStage: null, costUsd: 2.47, spendComplete: true, wallMs: 534_000, rounds: 41 }],
};

/** the signed job the gate judges against — kept validateJob-GREEN by its own test
 * below, so a gate case can never pass against a spec the arbiter would refuse */
const JOB = {
  schema: 'job-v1',
  job: 'litectx-u-types',
  description: 'tsc --strict migration for litectx; merge stays human',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Make litectx pass tsc --strict without weakening the tests.',
  verdictType: 'green',
  close: [
    { name: 'changed-from-seed', cmd: 'git diff --quiet', expect: 1, offer: false },
    { name: 'typecheck', cmd: 'npx tsc --noEmit', expect: 0 },
    { name: 'suite-green', cmd: 'npm test', expect: 0 },
    { name: 'no-suppressions', cmd: 'node scripts/no-suppressions.mjs', expect: 0 },
  ],
  escalation: { mode: 'decision-ready' },
};

const greenRow = (/** @type {any} */ o) => ({ at: '2026-07-01T00:00:00.000Z', runid: 'r', patient: 'p1', outcome: 'green', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 5, ...o });
const redRow = (/** @type {any} */ o) => ({ at: '2026-07-01T00:00:00.000Z', runid: 'r', patient: 'p1', outcome: 'red', failingStage: 'typecheck', costUsd: 1, spendComplete: true, wallMs: 1000, rounds: 5, ...o });

// ---------------------------------------------------------------------------
// fixture connectivity — a gate case is only meaningful against a spec the
// arbiter itself would accept (a fixture that cannot be signed proves nothing)
// ---------------------------------------------------------------------------

test('the JOB fixture is validateJob-green (the gate judges a signable spec)', () => {
  const r = validateJob(JOB);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('the BRIDGE fixture validates (the base every mutator starts from is clean)', () => {
  const r = validateBridge(BRIDGE);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.bridge, BRIDGE);
  assert.equal(BRIDGE_SCHEMA, 'bridge-v1');
});

// ---------------------------------------------------------------------------
// D6 — deriveStatus, the whole ladder including the re-promotion path
// ---------------------------------------------------------------------------

const STATUS_CASES = [
  ['no history at all → null (below the entry bar, not a status)', [], null],
  ['only casualties → null (a casualty is not a green)', [redRow({ outcome: 'provider-red', failingStage: null })], null],
  ['one green → candidate', [greenRow({})], 'candidate'],
  ['two greens on the SAME patient → candidate, never proven (R2: shape, not instance)', [greenRow({}), greenRow({ runid: 'r2' })], 'candidate'],
  ['greens on two DISTINCT patients → proven', [greenRow({}), greenRow({ patient: 'p2' })], 'proven'],
  ['three patients → still proven', [greenRow({}), greenRow({ patient: 'p2' }), greenRow({ patient: 'p3' })], 'proven'],
  ['a red on a PROVEN demotes to candidate', [greenRow({}), greenRow({ patient: 'p2' }), redRow({})], 'candidate'],
  ['a red on a CANDIDATE leaves it candidate (there is nothing below the entry bar)', [greenRow({}), redRow({})], 'candidate'],
  ['a red BEFORE the proving green does not demote what came after it', [greenRow({}), redRow({}), greenRow({ patient: 'p2' })], 'proven'],
  ['a CASUALTY on a proven does not demote (casualties are never evidence)', [greenRow({}), greenRow({ patient: 'p2' }), redRow({ outcome: 'wall-halt', failingStage: null })], 'proven'],
  ['re-promotion: demoted, then ONE green → candidate (one patient is not two)', [greenRow({}), greenRow({ patient: 'p2' }), redRow({}), greenRow({ patient: 'p1' })], 'candidate'],
  ['re-promotion: demoted, then greens on two distinct patients → proven again', [greenRow({}), greenRow({ patient: 'p2' }), redRow({}), greenRow({ patient: 'p1' }), greenRow({ patient: 'p2' })], 'proven'],
  ['re-promotion needs TWO distinct patients after the red, not a repeat of one', [greenRow({}), greenRow({ patient: 'p2' }), redRow({}), greenRow({ patient: 'p1' }), greenRow({ patient: 'p1' })], 'candidate'],
];

for (const [name, history, expected] of STATUS_CASES) {
  test(`deriveStatus: ${name}`, () => {
    assert.equal(deriveStatus(/** @type {any} */ (history)), expected);
  });
}

test('deriveStatus never throws on garbage and reads it as no-status', () => {
  for (const garbage of [undefined, null, 42, 'green', {}, [null], [42], [{}], [{ outcome: 'green' }]]) {
    assert.equal(deriveStatus(/** @type {any} */ (garbage)), null, `${JSON.stringify(garbage)} must read as null`);
  }
});

test('deriveStatus is ORDER-sensitive: the same rows in the demoting order differ', () => {
  const rows = [greenRow({}), greenRow({ patient: 'p2' }), redRow({})];
  assert.equal(deriveStatus(rows), 'candidate');
  assert.equal(deriveStatus([rows[2], rows[0], rows[1]]), 'proven');
});

// ---------------------------------------------------------------------------
// bridge shape — one red per case
// ---------------------------------------------------------------------------

const RED_CASES = [
  ['wrong schema', (b) => { b.schema = 'bridge-v2'; }, 'invalid-value:schema'],
  ['missing schema', (b) => { delete b.schema; }, 'missing-required:schema'],
  ['name is not a kebab slug', (b) => { b.name = '../escape'; }, 'invalid-value:name'],
  ['empty goal — the listing shows the job sentence it greened', (b) => { b.goal = ''; }, 'invalid-value:goal'],
  ['specHash must be a string or an explicit null, never a number', (b) => { b.specHash = 7; }, 'invalid-value:specHash'],
  ['specHash key must be PRESENT (an absent hash is not the same claim as an unknown one)', (b) => { delete b.specHash; }, 'missing-required:specHash'],
  ['closeStageNames must be a non-empty array — the load gate compares against it', (b) => { b.closeStageNames = []; }, 'invalid-value:closeStageNames'],
  ['a close stage name must be a slug', (b) => { b.closeStageNames = ['typecheck', 42]; }, 'invalid-value:closeStageNames.1'],
  ['toolsUsed must be inside the TOOL_MENU — an unknown verb can never pass the gate', (b) => { b.toolsUsed = ['read', 'telepathy']; }, 'invalid-value:toolsUsed'],
  ['toolsUsed may not name a LOCKED tool', (b) => { b.toolsUsed = ['read', 'run']; }, 'invalid-value:toolsUsed'],
  ['versions must be non-empty — the entry bar is at least one green', (b) => { b.versions = []; }, 'entry-bar:versions'],
  ['a version needs its plan', (b) => { delete b.versions[0].plan; }, 'missing-required:versions.0.plan'],
  ['a version needs its patient (the distinct-patient count is the status)', (b) => { delete b.versions[0].patient; }, 'invalid-value:versions.0.patient'],
  ['a version cost must be a number or an explicit null — never absent (F6)', (b) => { delete b.versions[0].costUsd; }, 'missing-required:versions.0.costUsd'],
  ['a version wall must be a number or an explicit null (F6 extends to time)', (b) => { delete b.versions[0].wallMs; }, 'missing-required:versions.0.wallMs'],
  ['a negative cost is not a cost', (b) => { b.versions[0].costUsd = -1; }, 'invalid-value:versions.0.costUsd'],
  ['a history row needs its outcome', (b) => { delete b.history[0].outcome; }, 'invalid-value:history.0.outcome'],
  ['a green history row may not name a failing stage', (b) => { b.history[0].failingStage = 'typecheck'; }, 'invalid-value:history.0.failingStage'],
  ['spendComplete must travel with every row (F44)', (b) => { delete b.history[0].spendComplete; }, 'invalid-value:history.0.spendComplete'],
  ['an UNKNOWN cost cannot be a COMPLETE spend (F6)', (b) => { b.history[0].costUsd = null; b.history[0].spendComplete = true; }, 'invalid-value:history.0.spendComplete'],
  ['green rows and versions must agree in count (R1: one green mints exactly one version)', (b) => { b.history.push(greenRow({ patient: 'p2' })); }, 'history-mismatch:history'],
  ['an unknown top-level field is a smuggle channel', (b) => { b.notes = 'anything'; }, 'unknown-field:notes'],
  ['an unknown version field', (b) => { b.versions[0].mints = true; }, 'unknown-field:versions.0.mints'],
  ['an unknown history field', (b) => { b.history[0].score = 0.9; }, 'unknown-field:history.0.score'],
];

for (const [name, mutator, expected] of RED_CASES) {
  test(`bridge red: ${name}`, () => {
    const r = validateBridge(mut(BRIDGE, /** @type {any} */ (mutator)));
    assert.equal(r.ok, false, 'must red');
    assert.equal(r.bridge, null, 'a redded bridge is never returned');
    assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, expected);
  });
}

test('validateBridge accepts JSON text and reds a parse failure, never throws', () => {
  const ok = validateBridge(JSON.stringify(BRIDGE));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.bridge, BRIDGE);
  for (const garbage of ['{nope', 42, null, [], undefined]) {
    const r = validateBridge(/** @type {any} */ (garbage));
    assert.equal(r.ok, false, `${JSON.stringify(garbage)} must red`);
    assert.equal(r.reds[0].code, 'parse-error');
    assert.equal(r.bridge, null);
  }
});

test('a null cost / wall / rounds validates — unknown is a legal, explicit value (F6)', () => {
  const unknown = mut(BRIDGE, (b) => {
    Object.assign(b.versions[0], { costUsd: null, wallMs: null, rounds: null });
    Object.assign(b.history[0], { costUsd: null, wallMs: null, rounds: null, spendComplete: false });
  });
  const r = validateBridge(unknown);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.equal(r.bridge.versions[0].costUsd, null, 'null survives validation — never coerced to 0');
  assert.equal(r.bridge.versions[0].wallMs, null);
  assert.equal(r.bridge.history[0].rounds, null);
});

// ---------------------------------------------------------------------------
// R1 — appendGreen mints a version, appendRed never does
// ---------------------------------------------------------------------------

const GREEN_RECORD = { runid: 'ms5uxhej', patient: 'aurora-u', at: '2026-07-29T09:27:11.999Z', plan: PLAN, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 38 };

const META = { name: 'litectx-u-types', goal: BRIDGE.goal, specHash: BRIDGE.specHash, closeStageNames: STAGES, toolsUsed: ['read', 'grep', 'edit'] };

test('mintBridge: the FIRST green mints the entry, at the candidate entry bar', () => {
  const r = mintBridge(META, GREEN_RECORD);
  assert.deepEqual(r.reds, []);
  assert.equal(validateBridge(r.bridge).ok, true);
  assert.equal(r.bridge.schema, BRIDGE_SCHEMA);
  assert.equal(r.bridge.versions.length, 1);
  assert.equal(r.bridge.history.length, 1);
  assert.equal(r.bridge.versions[0].runid, 'ms5uxhej');
  assert.equal(deriveStatus(r.bridge.history), 'candidate');
  assert.equal(listingRow(r.bridge).greens, 1);
});

test('mintBridge builds the SAME row shapes appendGreen does (one spelling, never two)', () => {
  const minted = mintBridge(META, GREEN_RECORD).bridge;
  const appended = appendGreen(mintBridge(META, { ...GREEN_RECORD, runid: 'first' }).bridge, GREEN_RECORD).bridge;
  assert.deepEqual(minted.versions[0], appended.versions.at(-1));
  assert.deepEqual(minted.history[0], appended.history.at(-1));
});

test('mintBridge refuses a bad record or bad meta, and never mints a red', () => {
  assert.equal(mintBridge(META, { ...GREEN_RECORD, costUsd: undefined }).ok, false);
  assert.equal(mintBridge({ ...META, name: '../escape' }, GREEN_RECORD).ok, false);
  assert.equal(mintBridge({ ...META, specHash: undefined }, GREEN_RECORD).ok, false);
  assert.equal(mintBridge({ ...META, toolsUsed: ['run'] }, GREEN_RECORD).ok, false);
  for (const bad of [undefined, null, 42, {}]) {
    const r = mintBridge(/** @type {any} */ (bad), GREEN_RECORD);
    assert.equal(r.ok, false);
    assert.equal(r.bridge, null);
  }
});

test('mintBridge accepts an UNKNOWN specHash as an explicit null (one probe-era file has none)', () => {
  const r = mintBridge({ ...META, specHash: null }, { ...GREEN_RECORD, at: null, costUsd: null, spendComplete: false, wallMs: null, rounds: null });
  assert.deepEqual(r.reds, []);
  assert.equal(r.bridge.specHash, null);
  assert.equal(r.bridge.versions[0].greenAt, null);
  assert.equal(r.bridge.history[0].at, null);
});

test('appendGreen adds ONE version (newest last) and ONE history row', () => {
  const r = appendGreen(BRIDGE, GREEN_RECORD);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.equal(r.bridge.versions.length, 2);
  assert.equal(r.bridge.versions.at(-1).runid, 'ms5uxhej', 'newest last');
  assert.deepEqual(r.bridge.versions.at(-1), { plan: PLAN, runid: 'ms5uxhej', greenAt: '2026-07-29T09:27:11.999Z', patient: 'aurora-u', costUsd: 2.21, wallMs: 534_000, rounds: 38 });
  assert.equal(r.bridge.history.length, 2);
  assert.deepEqual(r.bridge.history.at(-1), { at: '2026-07-29T09:27:11.999Z', runid: 'ms5uxhej', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 38 });
  assert.equal(validateBridge(r.bridge).ok, true, 'the result is itself a valid bridge');
  assert.equal(deriveStatus(r.bridge.history), 'proven', 'a second DISTINCT patient proves it');
});

test('appendGreen does not mutate the input bridge', () => {
  const before = clone(BRIDGE);
  appendGreen(BRIDGE, GREEN_RECORD);
  assert.deepEqual(BRIDGE, before);
});

test('appendGreen carries an optional per-green specHash onto the version', () => {
  const r = appendGreen(BRIDGE, { ...GREEN_RECORD, specHash: 'a'.repeat(64) });
  assert.equal(r.bridge.versions.at(-1).specHash, 'a'.repeat(64));
  assert.equal(validateBridge(r.bridge).ok, true);
});

test('appendGreen keeps an unknown cost NULL and marks the spend incomplete (F6)', () => {
  const r = appendGreen(BRIDGE, { ...GREEN_RECORD, costUsd: null, spendComplete: false, wallMs: null, rounds: null });
  assert.deepEqual(r.reds, []);
  assert.equal(r.bridge.versions.at(-1).costUsd, null);
  assert.equal(r.bridge.versions.at(-1).wallMs, null);
  assert.equal(r.bridge.history.at(-1).costUsd, null);
  assert.equal(r.bridge.history.at(-1).spendComplete, false);
});

test('appendRed writes a history row ONLY — versions are untouched (R1)', () => {
  const r = appendRed(BRIDGE, { runid: 'ms9lwtuf', patient: 'aurora-u', at: '2026-07-30T00:00:00.000Z', outcome: 'red', failingStage: 'typecheck', costUsd: 3.02, spendComplete: true, wallMs: 900_000, rounds: 52 });
  assert.deepEqual(r.reds, []);
  assert.deepEqual(r.bridge.versions, BRIDGE.versions, 'a red never touches the box');
  assert.equal(r.bridge.history.length, 2);
  assert.deepEqual(r.bridge.history.at(-1), { at: '2026-07-30T00:00:00.000Z', runid: 'ms9lwtuf', patient: 'aurora-u', outcome: 'red', failingStage: 'typecheck', costUsd: 3.02, spendComplete: true, wallMs: 900_000, rounds: 52 });
  assert.equal(validateBridge(r.bridge).ok, true);
});

test('appendRed records a CASUALTY class with no failing stage', () => {
  const r = appendRed(BRIDGE, { runid: 'x', patient: 'aurora-u', at: '2026-07-30T00:00:00.000Z', outcome: 'provider-red', failingStage: null, costUsd: null, spendComplete: false, wallMs: null, rounds: null });
  assert.deepEqual(r.reds, []);
  assert.equal(r.bridge.history.at(-1).outcome, 'provider-red');
  assert.equal(deriveStatus(r.bridge.history), 'candidate', 'a casualty changes no status');
});

test('appendRed REFUSES a green — a green must mint its version (R1)', () => {
  const r = appendRed(BRIDGE, { runid: 'x', patient: 'p', at: '2026-07-30T00:00:00.000Z', outcome: 'green', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1, rounds: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'invalid-value');
  assert.equal(r.reds[0].path, 'outcome');
  assert.equal(r.bridge, null);
});

const APPEND_RED_CASES = [
  ['a record without a runid', (rec) => { delete rec.runid; }, 'runid'],
  ['a record without a patient', (rec) => { delete rec.patient; }, 'patient'],
  ['a cost defaulted to nothing at all (F6: unknown must be explicit null)', (rec) => { delete rec.costUsd; }, 'costUsd'],
  ['a wall defaulted to nothing at all', (rec) => { delete rec.wallMs; }, 'wallMs'],
  ['spendComplete missing (F44: it travels with the spend)', (rec) => { delete rec.spendComplete; }, 'spendComplete'],
  ['an unknown cost claiming a complete spend', (rec) => { rec.costUsd = null; rec.spendComplete = true; }, 'spendComplete'],
  ['a failingStage that is neither a name nor an explicit null', (rec) => { delete rec.failingStage; }, 'failingStage'],
];

for (const [name, mutator, path] of APPEND_RED_CASES) {
  test(`appendGreen/appendRed refuse ${name}`, () => {
    const base = { runid: 'x', patient: 'p', at: '2026-07-30T00:00:00.000Z', outcome: 'red', failingStage: null, costUsd: 1, spendComplete: true, wallMs: 1, rounds: 1 };
    const r = appendRed(BRIDGE, mut(base, /** @type {any} */ (mutator)));
    assert.equal(r.ok, false, 'must red');
    assert.equal(r.bridge, null);
    assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
    assert.equal(r.reds[0].path, path);
  });
}

test('appendGreen refuses a record with no plan — the version IS the plan as executed', () => {
  const { plan, ...noPlan } = GREEN_RECORD;
  const r = appendGreen(BRIDGE, /** @type {any} */ (noPlan));
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].path, 'plan');
  assert.equal(r.bridge, null);
});

test('append refuses to build on an invalid bridge (fail closed, never throws)', () => {
  for (const bad of [undefined, null, 42, {}, mut(BRIDGE, (b) => { b.schema = 'nope'; })]) {
    const g = appendGreen(/** @type {any} */ (bad), GREEN_RECORD);
    assert.equal(g.ok, false, 'green must red');
    assert.equal(g.bridge, null);
    const rr = appendRed(/** @type {any} */ (bad), { runid: 'x', patient: 'p', at: 'z', outcome: 'red', failingStage: null, costUsd: null, spendComplete: false, wallMs: null, rounds: null });
    assert.equal(rr.ok, false, 'red must red');
  }
});

// ---------------------------------------------------------------------------
// D1 — storage: a directory of plain files, one bad file never kills the read
// ---------------------------------------------------------------------------

test('saveBridge writes atomically (temp+rename) and leaves no temp file behind', (t) => {
  const dir = tmp(t, 'bridges-save-');
  const r = saveBridge(dir, BRIDGE);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.equal(r.file, join(dir, 'litectx-u-types.json'));
  assert.deepEqual(readdirSync(dir), ['litectx-u-types.json'], 'no .tmp leftovers');
  const text = readFileSync(r.file, 'utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(text), BRIDGE);
});

test('saveBridge overwrites in place (a second green replaces the same file)', (t) => {
  const dir = tmp(t, 'bridges-save2-');
  saveBridge(dir, BRIDGE);
  const two = appendGreen(BRIDGE, GREEN_RECORD).bridge;
  const r = saveBridge(dir, two);
  assert.equal(r.ok, true);
  assert.deepEqual(readdirSync(dir), ['litectx-u-types.json']);
  assert.equal(JSON.parse(readFileSync(r.file, 'utf8')).versions.length, 2);
});

test('saveBridge REFUSES an invalid bridge and writes nothing', (t) => {
  const dir = tmp(t, 'bridges-refuse-');
  const r = saveBridge(dir, mut(BRIDGE, (b) => { b.name = '../escape'; }));
  assert.equal(r.ok, false);
  assert.equal(r.file, null);
  assert.deepEqual(readdirSync(dir), []);
});

test('saveBridge reds a missing registry dir rather than creating one (no default location)', () => {
  const r = saveBridge(join(tmpdir(), `no-such-registry-${Date.now()}`), BRIDGE);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'registry-missing');
  assert.equal(r.file, null);
});

test('loadBridge round-trips a saved file and reds a missing one', (t) => {
  const dir = tmp(t, 'bridges-load-');
  const { file } = saveBridge(dir, BRIDGE);
  const r = loadBridge(file);
  assert.deepEqual(r.reds, []);
  assert.deepEqual(r.bridge, BRIDGE);
  const missing = loadBridge(join(dir, 'nope.json'));
  assert.equal(missing.ok, false);
  assert.equal(missing.reds[0].code, 'read-error');
  assert.equal(missing.bridge, null);
});

test('loadRegistry skips and REPORTS a malformed file without losing the good ones', (t) => {
  const dir = tmp(t, 'bridges-registry-');
  saveBridge(dir, BRIDGE);
  saveBridge(dir, mut(BRIDGE, (b) => { b.name = 'aurora-u-spawner-types'; }));
  writeFileSync(join(dir, 'broken.json'), '{not json');
  writeFileSync(join(dir, 'wrong-shape.json'), JSON.stringify({ schema: 'bridge-v1' }));
  writeFileSync(join(dir, 'notes.txt'), 'ignored — only .json files are registry entries');
  const r = loadRegistry(dir);
  assert.equal(r.ok, false, 'a malformed entry is reported, not swallowed');
  assert.deepEqual(r.bridges.map((b) => b.name), ['aurora-u-spawner-types', 'litectx-u-types'], 'sorted by name, both good ones survive');
  const paths = r.reds.map((x) => x.path).sort();
  assert.deepEqual(paths, [join(dir, 'broken.json'), join(dir, 'wrong-shape.json')]);
});

test('loadRegistry on an empty dir is a clean empty read; a missing dir reds', (t) => {
  const dir = tmp(t, 'bridges-empty-');
  const empty = loadRegistry(dir);
  assert.deepEqual(empty, { ok: true, reds: [], bridges: [] });
  const missing = loadRegistry(join(dir, 'nope'));
  assert.equal(missing.ok, false);
  assert.equal(missing.reds[0].code, 'registry-missing');
  assert.deepEqual(missing.bridges, []);
});

// ---------------------------------------------------------------------------
// D3 — the listing row the selection surface consumes
// ---------------------------------------------------------------------------

test('listingRow reports the derived status, the counts, and the green cost band', () => {
  const two = appendGreen(BRIDGE, GREEN_RECORD).bridge;
  const row = listingRow(two);
  assert.deepEqual(row, {
    name: 'litectx-u-types',
    goal: 'Make litectx pass tsc --strict without weakening the tests.',
    status: 'proven',
    greens: 2,
    reds: 0,
    lastOutcome: 'green',
    greenCost: { minUsd: 2.21, maxUsd: 2.47, minWallMs: 534_000, maxWallMs: 534_000, unpricedCount: 0, untimedCount: 0 },
  });
});

test('listingRow counts a red and reports it as the last outcome', () => {
  const red = appendRed(BRIDGE, { runid: 'x', patient: 'aurora-u', at: 'z', outcome: 'red', failingStage: 'suite-green', costUsd: 0.4, spendComplete: true, wallMs: 10, rounds: 3 }).bridge;
  const row = listingRow(red);
  assert.equal(row.greens, 1);
  assert.equal(row.reds, 1);
  assert.equal(row.lastOutcome, 'red');
  assert.equal(row.status, 'candidate');
});

test('listingRow does NOT count a casualty as a red', () => {
  const cas = appendRed(BRIDGE, { runid: 'x', patient: 'aurora-u', at: 'z', outcome: 'wall-halt', failingStage: null, costUsd: null, spendComplete: false, wallMs: null, rounds: null }).bridge;
  const row = listingRow(cas);
  assert.equal(row.reds, 0);
  assert.equal(row.lastOutcome, 'wall-halt');
});

test('greenCost SKIPS unknown costs and says how many it skipped (F6, never a 0 floor)', () => {
  const unpriced = appendGreen(BRIDGE, { ...GREEN_RECORD, costUsd: null, spendComplete: false, wallMs: null }).bridge;
  const row = listingRow(unpriced);
  assert.deepEqual(row.greenCost, { minUsd: 2.47, maxUsd: 2.47, minWallMs: 534_000, maxWallMs: 534_000, unpricedCount: 1, untimedCount: 1 });
});

test('greenCost with NO priced green is null, never 0 (unpriced is never free)', () => {
  const none = mut(BRIDGE, (b) => {
    Object.assign(b.versions[0], { costUsd: null, wallMs: null });
    Object.assign(b.history[0], { costUsd: null, wallMs: null, spendComplete: false });
  });
  assert.deepEqual(listingRow(none).greenCost, { minUsd: null, maxUsd: null, minWallMs: null, maxWallMs: null, unpricedCount: 1, untimedCount: 1 });
});

test('listingRow never throws on a malformed bridge', () => {
  for (const bad of [undefined, null, 42, {}, { name: 'x' }]) {
    const row = listingRow(/** @type {any} */ (bad));
    assert.equal(typeof row, 'object');
    assert.equal(row.status, null);
  }
});

// ---------------------------------------------------------------------------
// D2 (as SPLIT, 2026-08-01) — the LOAD GATE: exactly three shape checks
// ---------------------------------------------------------------------------

test('loadGate passes a bridge of the same SHAPE against a different patient', () => {
  const r = loadGate(BRIDGE, JOB);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('loadGate ignores paths, scopes and targets — instance-bound and EXPECTED to red at draft time', () => {
  // the aurora bridge against the litectx job: every stored path names another
  // patient's tree, which is what a recipe from a different day IS. The pre-probe
  // measured the drafter replacing them unaided (3/3 legal after tweak).
  const foreign = mut(BRIDGE, (b) => {
    b.name = 'aurora-u-spawner-types';
    b.versions[0].plan.steps[0].target = 'packages/spawner/src/aurora_spawner';
    b.versions[0].plan.steps[0].exit[0].scope = 'packages/spawner/src/aurora_spawner/**';
  });
  const r = loadGate(foreign, JOB);
  assert.deepEqual(r.reds, [], 'a foreign path is not a load-gate concern');
  assert.equal(r.ok, true);
});

test('loadGate reds a stage-name MISMATCH as recipe-stale', () => {
  const r = loadGate(mut(BRIDGE, (b) => { b.closeStageNames = ['changed-from-seed', 'typecheck', 'mutation-kill-rate']; }), JOB);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'recipe-stale');
  assert.equal(r.reds[0].path, 'closeStageNames');
});

test('loadGate reds a stage-ORDER swap (same names, different sequence)', () => {
  const r = loadGate(mut(BRIDGE, (b) => { b.closeStageNames = ['typecheck', 'changed-from-seed', 'suite-green', 'no-suppressions']; }), JOB);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].path, 'closeStageNames');
});

test('loadGate reds a stage-COUNT difference (a prefix is not a match)', () => {
  const r = loadGate(mut(BRIDGE, (b) => { b.closeStageNames = STAGES.slice(0, 3); }), JOB);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].path, 'closeStageNames');
});

test('loadGate reds a locked verdict type — v1 admits green only', () => {
  for (const verdictType of ['soft-green', 'hitl', undefined, 'nonsense']) {
    const r = loadGate(BRIDGE, { ...JOB, verdictType });
    assert.equal(r.ok, false, `${verdictType} must red`);
    assert.equal(r.reds[0].code, 'recipe-stale');
    assert.equal(r.reds[0].path, 'verdictType');
  }
});

test('loadGate reds a verb OUTSIDE this job\'s signed menu', () => {
  const narrow = { ...JOB, tools: ['read', 'grep'] };
  const r = loadGate(BRIDGE, narrow);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'recipe-stale');
  assert.equal(r.reds[0].path, 'toolsUsed');
  assert.match(r.reds[0].detail ?? '', /edit/, 'the red names the verb that does not fit');
});

test('loadGate reads an OMITTED tools as the concrete current TOOL_MENU (MED-1)', () => {
  const { tools, ...omitted } = { ...JOB, tools: ['read'] };
  assert.equal(loadGate(BRIDGE, omitted).ok, true, 'omitted means the whole menu');
  assert.equal(loadGate(mut(BRIDGE, (b) => { b.toolsUsed = [...TOOL_MENU]; }), omitted).ok, true);
});

test('loadGate reds EVERY failed check at once — the operator sees the whole mismatch', () => {
  const r = loadGate(mut(BRIDGE, (b) => { b.closeStageNames = ['other']; b.toolsUsed = ['read', 'edit']; }), { ...JOB, verdictType: 'hitl', tools: ['read'] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.reds.map((x) => x.path).sort(), ['closeStageNames', 'toolsUsed', 'verdictType']);
  assert.equal(r.reds.every((x) => x.code === 'recipe-stale'), true);
});

// ---------------------------------------------------------------------------
// the consolidation of the probe-era files (D1: seed data, part of the build).
// Driven as a real process against real old-shape files — the script is the
// instrument the operator runs, so the test runs THAT, not a re-implementation.
// ---------------------------------------------------------------------------

const SCRIPT = new URL('../scripts/consolidate-bridges.mjs', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

/** two old-shape files for ONE real job, one of them missing specHash+greenAt
 * exactly like `bridge-aurora-u-spawner-types-ms2c0ls7.json` does on disk */
function oldSourceDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-u-bareloop-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const plan = { schema: 'plan-v1', steps: [{ id: 'a', action: 'x', tools: ['read', 'edit'], rounds: 10, exit: [{ type: 'check-passes', name: 'typecheck' }] }] };
  writeFileSync(join(dir, 'bridge-aurora-u-spawner-types-ms2c0ls7.json'), JSON.stringify({ job: 'aurora-u-spawner-types', runid: 'ms2c0ls7', recovered_from: 'spine', plan }));
  writeFileSync(join(dir, 'bridge-aurora-u-spawner-types-ms7flkok.json'), JSON.stringify({ job: 'aurora-u-spawner-types', specHash: 'b'.repeat(64), runid: 'ms7flkok', greenAt: '2026-07-30T11:40:49.970Z', plan }));
  return dir;
}

test('consolidate: refuses without a target registry dir (no default location)', () => {
  const r = run(['--dry-run']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /registry DIRECTORY is required/);
});

test('consolidate --dry-run writes NOTHING', (t) => {
  const src = oldSourceDir(t);
  const dir = tmp(t, 'consolidate-dry-');
  const r = run([dir, '--dry-run', '--from', src]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would write/);
  assert.deepEqual(readdirSync(dir), [], 'a dry run touches nothing');
});

test('consolidate converts every green into one entry, with UNKNOWN receipts kept null', (t) => {
  const src = oldSourceDir(t);
  const dir = tmp(t, 'consolidate-');
  const r = run([dir, '--from', src]);
  assert.equal(r.status, 0, r.stderr);
  const reg = loadRegistry(dir);
  assert.deepEqual(reg.reds, []);
  assert.equal(reg.bridges.length, 1, 'two greens of one job are ONE bridge with two versions');
  const b = reg.bridges[0];
  assert.equal(b.name, 'aurora-u-spawner-types');
  assert.equal(b.versions.length, 2);
  assert.deepEqual(b.versions.map((v) => v.runid), ['ms2c0ls7', 'ms7flkok'], 'oldest first, newest last');
  assert.equal(b.versions[0].specHash, null, 'a missing hash stays an explicit unknown');
  assert.equal(b.versions[0].greenAt, null);
  assert.equal(b.specHash, 'b'.repeat(64), 'the entry carries the NEWEST green\'s hash');
  for (const v of b.versions) {
    assert.equal(v.costUsd, null, 'no receipt is invented (F6)');
    assert.equal(v.wallMs, null);
    assert.equal(v.rounds, null);
  }
  assert.equal(b.history.every((h) => h.spendComplete === false), true, 'an unknown spend is never complete');
  // the label comes from the SIGNED spec, never from the stored plan
  const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-u-spawner-types.json', import.meta.url).pathname, 'utf8'));
  assert.equal(b.goal, spec.goal);
  assert.deepEqual(b.closeStageNames, spec.close.map((s) => s.name));
  assert.deepEqual(b.toolsUsed, ['read', 'edit'], 'the union of the plans\' step verbs, in menu order');
  // both greens are the same patient, so the entry is a CANDIDATE — consolidation
  // mints no promotion it did not find
  assert.equal(listingRow(b).status, 'candidate');
  // and the seeded entry is loadable against its own job spec
  assert.equal(loadGate(b, spec).ok, true);
});

test('consolidate REFUSES to overwrite an existing entry without --force', (t) => {
  const src = oldSourceDir(t);
  const dir = tmp(t, 'consolidate-force-');
  assert.equal(run([dir, '--from', src]).status, 0);
  const first = readFileSync(join(dir, 'aurora-u-spawner-types.json'), 'utf8');
  const again = run([dir, '--from', src]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /REFUSED/);
  assert.equal(readFileSync(join(dir, 'aurora-u-spawner-types.json'), 'utf8'), first);
  assert.equal(run([dir, '--from', src, '--force']).status, 0);
});

test('consolidate refuses a file it cannot read as a probe-era bridge — never guesses', (t) => {
  const src = oldSourceDir(t);
  writeFileSync(join(src, 'bridge-nonsense.json'), JSON.stringify({ hello: 'world' }));
  const dir = tmp(t, 'consolidate-bad-');
  const r = run([dir, '--from', src]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to guess/);
  assert.deepEqual(readdirSync(dir), []);
});

test('loadGate fails CLOSED on malformed inputs and never throws', () => {
  for (const bad of [undefined, null, 42, {}, 'bridge']) {
    assert.equal(loadGate(/** @type {any} */ (bad), JOB).ok, false, 'bad bridge must red');
    assert.equal(loadGate(BRIDGE, /** @type {any} */ (bad)).ok, false, 'bad job must red');
  }
  assert.equal(loadGate(BRIDGE, { ...JOB, close: 'npm test' }).ok, false, 'a close that stages nothing cannot match');
});
