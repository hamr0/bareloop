// SOFTGREEN MODULE 6 — QUARANTINE, and the signer's accept as the release.
//
// The standing ruling (PRD v1.53, given its mechanism by v1.71 §3): *softgreen
// passes are QUARANTINED from learning credit until the floor is proven*, and
// **accept is what releases the run's learning credit**. The row is MINTED — a
// judged green is a real run against a real workflow and the record says so — it
// is simply worth NOTHING until a person takes the door. Never a deletion, never
// a withheld row, and the unlock is FORWARD-ONLY: nothing walks the ledger
// backwards to re-hold what a signer already released.
//
// What this file holds, each traced to its ruling:
//  - a soft-green green mints `quarantined: true` on BOTH halves of R1's pair
//    (the version, which is what inherits, and the history row, which is what the
//    status ladder reads) — one construction site, so they cannot drift.
//  - a GREEN-class run is byte-identical to before the flag existed. No key, no
//    behaviour change. This is the regression half and it is not decoration:
//    quarantining the wrong class silently freezes Layer 3.
//  - accept releases, forward-only and idempotent; rerun and pause do NOT.
//  - a released row is reuse-eligible; a held one is SKIPPED WITH A REASON, the
//    same visible-skip discipline `loadRegistry`'s unreadable entries already get.
//  - the door decisions are RECORDED on the row (the report card, v1.71 §3:
//    *"the signer's accepts double as the judge's ongoing report card"*) — facts,
//    never a computed score. D6's no-score rule applies to the judge too.
//  - accept on an ALREADY-GREEN run still mints nothing (slice 1's rule):
//    releasing is not minting, and a run with no row of its own has nothing to
//    release.
//
// NO test in this file makes a paid call.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateJob } from '../src/job.js';
import { classGuards } from '../src/authoring.js';
import {
  validateBridge, mintBridge, appendGreen, appendRed, deriveStatus, listingRow,
  loadBridge, loadRegistry, saveBridge, makeRegistry,
  QUARANTINED_VERDICTS, quarantinesCredit, newestEligibleVersion, reuseEligibility, recordDoor,
} from '../src/bridges.js';
import { renderListing } from '../src/selection.js';
import { selectBridge, runReuse, applyDoorDecision } from '../src/reuse.js';
import { scriptedProvider } from './helpers.js';

const clone = (/** @type {any} */ o) => JSON.parse(JSON.stringify(o));
const base = mkdtempSync(join(tmpdir(), 'quarantine-test-'));
let n = 0;
const freshRegistry = () => makeRegistry(join(base, `reg-${n += 1}`));

const PLAN = (id = 'fix-types') => ({
  schema: 'plan-v1',
  steps: [{ id, action: 'Fix the types.', tools: ['read', 'edit'], rounds: 8, target: 'src/x.js', exit: [{ type: 'tree-changed', scope: 'src/**' }] }],
});

const META = (over = {}) => ({
  name: 'jsdoc-pass',
  goal: 'Document every exported function in src/ with accurate JSDoc.',
  specHash: 'signed-hash',
  closeStageNames: ['changed-from-seed', 'docs-read-well'],
  toolsUsed: ['read', 'edit'],
  ...over,
});

const RECORD = (over = {}) => ({
  runid: 'ms1', patient: 'litectx-u', at: '2026-08-18T10:00:00.000Z', plan: PLAN(),
  costUsd: 1.25, spendComplete: true, wallMs: 500_000, rounds: 12, ...over,
});

/** a minted bridge, held or free depending on the verdict class that paid for it */
const minted = (/** @type {string} */ verdictType, /** @type {any} */ over = {}) => {
  const r = mintBridge(META(), RECORD({ verdictType, ...over }));
  assert.equal(r.ok, true, `fixture must mint: ${JSON.stringify(r.reds)}`);
  return r.bridge;
};

// ── 1. minting: the flag rides the class that paid, and NOTHING else ─────────

test('a soft-green green mints QUARANTINED on both halves of R1\'s pair — the version and the row', () => {
  const b = minted('soft-green');
  assert.equal(b.versions[0].quarantined, true, 'the VERSION is what inherits, so the hold is on it');
  assert.equal(b.history[0].quarantined, true, 'and the ROW is what the status ladder reads');
  assert.equal(validateBridge(b).ok, true, 'a held entry is a VALID entry — the row exists, it is simply worth nothing yet');
  assert.equal(quarantinesCredit('soft-green'), true);
  assert.deepEqual([...QUARANTINED_VERDICTS], ['soft-green']);
});

test('REGRESSION — a green-class run is byte-identical to a run with no verdict class at all: no flag, no key', () => {
  const green = minted('green');
  const silent = minted(undefined);
  assert.deepEqual(green, silent, 'declaring green and declaring nothing mint the same bytes');
  assert.equal('quarantined' in green.versions[0], false, 'not `false` — ABSENT: a green earns its credit at the close');
  assert.equal('quarantined' in green.history[0], false);
  assert.equal(deriveStatus(green.history), 'candidate', 'and it counts, exactly as it did before this rung');
  assert.equal(reuseEligibility(green).ok, true);
  assert.equal(newestEligibleVersion(green).runid, 'ms1');
});

test('hitl is NOT quarantined — the ruling is about the young JUDGE, not about every non-green class', () => {
  assert.equal(quarantinesCredit('hitl'), false);
  assert.equal('quarantined' in minted('hitl').versions[0], false);
});

test('appendGreen carries the flag per RUN, not per entry — a released bridge\'s next judged green is held again', () => {
  const released = recordDoor(minted('soft-green'), { runid: 'ms1', decision: 'accept', at: '2026-08-18T11:00:00.000Z' }).bridge;
  const r = appendGreen(released, RECORD({ runid: 'ms2', patient: 'aurora-u', verdictType: 'soft-green', plan: PLAN('second') }));
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.bridge.versions[0].quarantined, false, 'the released one stays released');
  assert.equal(r.bridge.versions[1].quarantined, true, 'the new green is a NEW judgement and is held on its own');
});

// ── 2. what the hold WITHHOLDS ──────────────────────────────────────────────

test('a held green earns no learning credit: deriveStatus does not count it, and the release is what promotes', () => {
  let b = minted('soft-green');
  b = appendGreen(b, RECORD({ runid: 'ms2', patient: 'aurora-u', verdictType: 'soft-green' })).bridge;
  assert.equal(deriveStatus(b.history), null, 'two held greens on two patients are still no evidence at all');
  b = recordDoor(b, { runid: 'ms1', decision: 'accept', at: 'a' }).bridge;
  assert.equal(deriveStatus(b.history), 'candidate', 'one accept, one green');
  b = recordDoor(b, { runid: 'ms2', decision: 'accept', at: 'b' }).bridge;
  assert.equal(deriveStatus(b.history), 'proven', 'two accepts on two distinct patients');
});

test('a held entry is INELIGIBLE for reuse and says why; the newest RELEASED version is the one that inherits', () => {
  const held = minted('soft-green');
  const e = reuseEligibility(held);
  assert.equal(e.ok, false);
  assert.equal(newestEligibleVersion(held), null);
  assert.match(e.reason, /accept/i, `the reason names the door that releases it: ${e.reason}`);

  // released green, then a fresh held one on top: the held version must NOT be inherited
  let b = recordDoor(held, { runid: 'ms1', decision: 'accept', at: 'a' }).bridge;
  b = appendGreen(b, RECORD({ runid: 'ms2', patient: 'aurora-u', verdictType: 'soft-green', plan: PLAN('held-newest') })).bridge;
  assert.equal(reuseEligibility(b).ok, true, 'it still holds a released version');
  assert.equal(newestEligibleVersion(b).runid, 'ms1', 'never the held one, even though it is newest');
});

// ── 3. the door ─────────────────────────────────────────────────────────────

test('ACCEPT releases — and the release is recorded with what released it', () => {
  const r = recordDoor(minted('soft-green'), { runid: 'ms1', decision: 'accept', at: '2026-08-18T11:00:00.000Z' });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.released, true);
  assert.equal(r.bridge.versions[0].quarantined, false, 'a flag, never a deletion — the key stays and says released');
  assert.equal(r.bridge.history[0].quarantined, false);
  assert.deepEqual(r.bridge.history[0].doors, [{ decision: 'accept', at: '2026-08-18T11:00:00.000Z' }]);
  assert.equal(validateBridge(r.bridge).ok, true);
});

test('a double accept is IDEMPOTENT — the same bytes, one door record, one release', () => {
  const once = recordDoor(minted('soft-green'), { runid: 'ms1', decision: 'accept', at: 'a' });
  const twice = recordDoor(once.bridge, { runid: 'ms1', decision: 'accept', at: 'b' });
  assert.equal(twice.ok, true, JSON.stringify(twice.reds));
  assert.equal(twice.released, false, 'nothing was released the second time — it was already free');
  assert.deepEqual(twice.bridge, once.bridge, 'and the record is untouched: the FIRST accept is the one that released it');
});

test('RERUN and PAUSE do not release — the hold stands and the decision is still recorded', () => {
  for (const decision of ['rerun', 'pause']) {
    const r = recordDoor(minted('soft-green'), { runid: 'ms1', decision, at: 'a' });
    assert.equal(r.ok, true, JSON.stringify(r.reds));
    assert.equal(r.released, false);
    assert.equal(r.bridge.versions[0].quarantined, true, `${decision} leaves the hold exactly where it was`);
    assert.equal(r.bridge.history[0].quarantined, true);
    assert.deepEqual(r.bridge.history[0].doors, [{ decision, at: 'a' }], 'and the report card keeps it');
  }
});

test('FORWARD-ONLY — a rerun after an accept records the disagreement but never re-quarantines', () => {
  let b = recordDoor(minted('soft-green'), { runid: 'ms1', decision: 'accept', at: 'a' }).bridge;
  const r = recordDoor(b, { runid: 'ms1', decision: 'rerun', at: 'b' });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.bridge.versions[0].quarantined, false, 'released is released — nothing walks it backwards');
  assert.equal(r.bridge.history[0].quarantined, false);
  assert.deepEqual(r.bridge.history[0].doors.map((/** @type {any} */ d) => d.decision), ['accept', 'rerun'],
    'and BOTH are on the card: a signer who changed their mind is exactly the datum this collects');
  b = r.bridge;
  assert.equal(reuseEligibility(b).ok, true);
});

test('a door on a run with NO row of its own is refused — releasing is not minting (the already-green rule, slice 1)', () => {
  const r = recordDoor(minted('soft-green'), { runid: 'never-ran-here', decision: 'accept', at: 'a' });
  assert.equal(r.ok, false);
  assert.equal(r.bridge, null, 'nothing is invented to hang the accept on');
  assert.equal(r.reds[0].code, 'no-row-for-run');
});

test('a door on a RED row is refused — a disposition attaches to the run that earned a row, and a red earned none', () => {
  const b = appendRed(minted('soft-green'), { runid: 'ms2', patient: 'aurora-u', at: 'x', outcome: 'red', failingStage: 'docs-read-well', costUsd: 1, spendComplete: true, wallMs: 1, rounds: 1 }).bridge;
  const r = recordDoor(b, { runid: 'ms2', decision: 'accept', at: 'a' });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'no-row-for-run');
});

test('a fourth door is inexpressible, and a malformed bridge comes back as reds — never a throw', () => {
  const bad = recordDoor(minted('soft-green'), { runid: 'ms1', decision: 'approve', at: 'a' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reds[0].path, 'decision');
  assert.match(bad.reds[0].detail, /accept \| rerun \| pause/);
  assert.equal(recordDoor({ not: 'a bridge' }, { runid: 'ms1', decision: 'accept', at: 'a' }).ok, false);
  assert.equal(recordDoor(minted('soft-green'), null).ok, false);
});

// ── 4. the validator: the two halves can never drift ────────────────────────

test('the validator reds a version/row quarantine DISAGREEMENT — one hold, two spellings, is the drift this forbids', () => {
  const b = clone(minted('soft-green'));
  delete b.history[0].quarantined;
  const r = validateBridge(b);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'quarantine-mismatch', JSON.stringify(r.reds));
});

test('the validator reds a hold on a NON-GREEN row — nothing but a green ever minted credit to withhold', () => {
  const b = clone(minted('soft-green'));
  b.history.push({ at: 'x', runid: 'ms2', patient: 'aurora-u', outcome: 'red', failingStage: 's', costUsd: 1, spendComplete: true, wallMs: 1, rounds: 1, quarantined: true });
  const r = validateBridge(b);
  assert.equal(r.ok, false);
  assert.equal(r.reds.some((/** @type {any} */ x) => x.path.endsWith('quarantined')), true, JSON.stringify(r.reds));
});

test('the validator reds a malformed door record and an unknown door decision on disk', () => {
  const b = clone(minted('soft-green'));
  b.history[0].doors = [{ decision: 'approve', at: 'a' }];
  assert.equal(validateBridge(b).ok, false);
  const c = clone(minted('soft-green'));
  c.history[0].doors = [{ decision: 'accept', at: 'a', note: 'smuggled' }];
  assert.equal(validateBridge(c).ok, false, 'the door record has an exact field set, like every other record here');
});

// ── 5. the readouts ─────────────────────────────────────────────────────────

test('the listing row shows the hold and the door decisions as FACTS — counted, never scored', () => {
  const b = recordDoor(
    appendGreen(minted('soft-green'), RECORD({ runid: 'ms2', patient: 'aurora-u', verdictType: 'soft-green' })).bridge,
    { runid: 'ms1', decision: 'accept', at: 'a' },
  ).bridge;
  const row = listingRow(b);
  assert.equal(row.greens, 2, 'both greens happened and the record says so');
  assert.equal(row.quarantinedGreens, 1, 'one is still held');
  assert.deepEqual(row.doorDecisions, [{ runid: 'ms1', decision: 'accept', at: 'a' }]);
  assert.equal(row.status, 'candidate', 'and only the released one bought status');
});

test('a wholly-held entry renders as HELD in the human listing, never as a workflow with no green', () => {
  const text = renderListing({ ok: true, reds: [], bridges: [minted('soft-green')] });
  assert.match(text, /HELD/, text);
  assert.doesNotMatch(text, /NO-GREEN/);
});

// ── 6. selection: a visible skip, never a silent one ────────────────────────

const JOB = (over = {}) => ({
  schema: 'job-v1',
  job: 'jsdoc-pass',
  description: 'document every exported function in src/',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  maxWallMs: 1_800_000,
  writeScope: ['src/**'],
  goal: 'Document every exported function in src/ with accurate JSDoc.',
  verdictType: 'green',
  close: [{ name: 'typecheck', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const picker = (/** @type {any} */ answer) => scriptedProvider([{ text: JSON.stringify(answer) }]);

const seed = (/** @type {any[]} */ bridges) => {
  const dir = freshRegistry();
  for (const b of bridges) {
    const r = saveBridge(dir, b);
    assert.equal(r.ok, true, `fixture bridge must be valid: ${JSON.stringify(r.reds)}`);
  }
  return dir;
};

test('a HELD workflow is not offered, and the picker is TOLD it was held back', async () => {
  const dir = seed([minted('soft-green')]);
  const provider = picker({ choice: null, reason: 'none' });
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider });
  assert.deepEqual(sel.candidates, [], 'nothing to offer');
  assert.equal(sel.called, false, 'and no token is spent picking from an empty shelf');
  assert.equal(sel.quarantineSkips.length, 1);
  assert.equal(sel.quarantineSkips[0].name, 'jsdoc-pass');
  assert.match(sel.quarantineSkips[0].reason, /accept/i);
});

test('once the signer accepts, the same workflow IS offered — the release is the whole gate', async () => {
  const released = recordDoor(minted('soft-green'), { runid: 'ms1', decision: 'accept', at: 'a' }).bridge;
  const dir = seed([released]);
  const sel = await selectBridge({ registry: loadRegistry(dir), job: JOB(), ask: 'x', provider: picker({ choice: 'jsdoc-pass', reason: 'same kind of work' }) });
  assert.deepEqual(sel.candidates, ['jsdoc-pass']);
  assert.equal(sel.choice, 'jsdoc-pass');
  assert.deepEqual(sel.quarantineSkips, []);
});

test('the held entry rides into the LISTING TEXT as a stated skip — the same visible-skip rule an unreadable file gets', () => {
  const text = renderListing({
    ok: false,
    reds: [{ code: 'quarantined', path: 'jsdoc-pass', detail: 'held: the signer has not accepted this judged green yet' }],
    bridges: [],
  });
  assert.match(text, /HELD|held/, text);
  assert.doesNotMatch(text, /could not be read/, 'a held workflow is perfectly readable — saying otherwise is a lie in a NOTE');
});

// ── 7. end to end, through the runner that writes the box ───────────────────

const softJob = () => {
  const noSuppressions = classGuards({ verdictType: 'soft-green', lang: 'js' }).find((g) => g.name === 'no-suppressions');
  const j = JOB({
    verdictType: 'soft-green',
    closeDecl: {
      genre: 'TYPES',
      lang: 'js',
      stages: [
        { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } },
        { name: 'no-suppressions', kind: 'pattern-absent-in-diff', params: { patterns: noSuppressions.params.patterns, extensions: noSuppressions.params.extensions } },
        { name: 'docs-read-well', kind: 'judged-floor', params: { card: { items: [{ rule: 'has-doc', text: 'Every exported function carries a JSDoc block.' }] }, paths: ['src/spine.js'] } },
      ],
    },
  });
  delete j.close;
  return j;
};

/** the same scripted runJob the reuse suite uses: a try is a real paid run, and
 * nothing about the box's logic needs one */
const scriptedRuns = (/** @type {any[]} */ script) => {
  let i = 0;
  return async (/** @type {any} */ _spec, /** @type {any} */ opts) => {
    const s = script[Math.min(i, script.length - 1)];
    i += 1;
    opts.emit('worker-round', { kind: 'turn', costUsd: 0.5 });
    if (s.plan !== undefined) opts.emit('plan-accepted', { plan: s.plan });
    opts.emit('outer-close', { verdict: s.outcome === 'green' ? 'satisfied' : 'red', stage: 'docs-read-well' });
    opts.emit('job-end', { outcome: s.outcome, spentUsd: 1, spendComplete: true });
    return s.outcome;
  };
};

const runOpts = (/** @type {any} */ over = {}) => ({
  job: JOB(),
  approvals: [],
  registryDir: null,
  envelope: { perTryBudgetUsd: 1.5, perTryWallMs: 1_800_000, bridgeTries: 1 },
  patient: 'litectx-u',
  workdir: base,
  provider: picker({ choice: null, reason: 'none' }),
  selectionProvider: picker({ choice: null, reason: 'none' }),
  emit: () => ({}),
  ...over,
});

test('e2e — a soft-green run that greens mints its bridge HELD; the identical green-class run mints it free', async () => {
  const soft = softJob();
  assert.equal(validateJob(soft).ok, true, `the soft-green spec must be a REAL one: ${JSON.stringify(validateJob(soft).reds)}`);

  const softDir = freshRegistry();
  const r = await runReuse(runOpts({ job: soft, registryDir: softDir, runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('as-executed') }]) }));
  assert.equal(r.outcome, 'green', 'the loop\'s own verdict is UNTOUCHED — the door never changes it');
  const held = loadBridge(join(softDir, 'jsdoc-pass.json'));
  assert.equal(held.ok, true, JSON.stringify(held.reds));
  assert.equal(held.bridge.versions[0].quarantined, true, 'minted, and worth nothing until a person says so');
  assert.equal(held.bridge.history[0].quarantined, true);

  const greenDir = freshRegistry();
  const g = await runReuse(runOpts({ registryDir: greenDir, runJob: scriptedRuns([{ outcome: 'green', plan: PLAN('as-executed') }]) }));
  assert.equal(g.outcome, 'green');
  const free = loadBridge(join(greenDir, 'jsdoc-pass.json'));
  assert.equal('quarantined' in free.bridge.versions[0], false, 'REGRESSION: a green-class row is unflagged, exactly as before');
  assert.equal(deriveStatus(free.bridge.history), 'candidate');
});

test('applyDoorDecision releases the run\'s credit ON DISK, and says what it did', () => {
  const dir = seed([minted('soft-green')]);
  const r = applyDoorDecision({ registryDir: dir, name: 'jsdoc-pass', runid: 'ms1', decision: 'accept', at: 'a' });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.released, true);
  const saved = loadBridge(join(dir, 'jsdoc-pass.json'));
  assert.equal(saved.bridge.versions[0].quarantined, false);
  assert.deepEqual(saved.bridge.history[0].doors, [{ decision: 'accept', at: 'a' }]);

  const again = applyDoorDecision({ registryDir: dir, name: 'jsdoc-pass', runid: 'ms1', decision: 'accept', at: 'b' });
  assert.equal(again.released, false, 'forward-only and idempotent all the way to the file');

  const missing = applyDoorDecision({ registryDir: dir, name: 'no-such-workflow', runid: 'ms1', decision: 'accept', at: 'a' });
  assert.equal(missing.ok, false, 'a door on a workflow nobody holds is a red, never a conjured entry');
});

test('accept on an ALREADY-GREEN run mints nothing: no entry appears, and the door has nothing to release', () => {
  const dir = freshRegistry();
  const r = applyDoorDecision({ registryDir: dir, name: 'jsdoc-pass', runid: 'ms1', decision: 'accept', at: 'a' });
  assert.equal(r.ok, false);
  assert.equal(loadRegistry(dir).bridges.length, 0, 'the registry is still empty — accept confirms a verdict, it never mints one');
});

process.on('exit', () => rmSync(base, { recursive: true, force: true }));
