// Layer 3 module 3, D3's DISPLAY half: the listing a human can always inspect and
// the selection prompt a later module will send. Neither of these decides anything —
// the LLM-selection CALL, the pin/shortlist/force-cold flow and the parse of the
// answer belong to the runner (modules 4/5). What is under test here is that the
// listing tells the truth about the registry it was handed:
//
//  - F6: an unknown cost or time renders as UNKNOWN, never as $0.00 / 0 min, and an
//    aggregate that skipped unknowns says how many it skipped.
//  - the blind-instrument rule: a registry file that could not be read is NAMED in the
//    listing, never silently shown as a shorter list than the directory holds.
//  - deterministic ordering: the same registry renders byte-identically whatever order
//    the entries arrived in (a listing an LLM picks from must not reshuffle per call).
//  - D3's two rules ride in the prompt: "none matches → say so and draft new", and a
//    pinned workflow may be refused only EXPLICITLY, with a reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderListing, selectionPrompt } from '../src/selection.js';

const version = (over = {}) => ({ plan: { schema: 'plan-v1', steps: [] }, runid: 'ms1', greenAt: '2026-07-27T10:00:00Z', patient: 'aurora-u', costUsd: 2.21, wallMs: 534_000, rounds: 40, ...over });
const row = (over = {}) => ({ at: '2026-07-27T10:00:00Z', runid: 'ms1', patient: 'aurora-u', outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 40, ...over });

const BRIDGE = (over = {}) => ({
  schema: 'bridge-v1',
  name: 'aurora-u-spawner-types',
  goal: 'Make the spawner pass tsc --strict without weakening the tests.',
  specHash: 'abc',
  closeStageNames: ['changed-from-seed', 'typecheck', 'suite-green', 'no-suppressions'],
  toolsUsed: ['read', 'grep', 'edit'],
  versions: [version()],
  history: [row()],
  ...over,
});

test('one bridge renders as one compact block: name, goal, status, greens/reds, and the green cost/time band', () => {
  const out = renderListing({ ok: true, reds: [], bridges: [BRIDGE()] });
  assert.match(out, /aurora-u-spawner-types/);
  assert.match(out, /Make the spawner pass tsc --strict/);
  assert.match(out, /CANDIDATE/, 'one green is the entry bar, not a proof');
  assert.match(out, /1 green/);
  assert.match(out, /0 red/);
  assert.match(out, /\$2\.21/);
  assert.match(out, /8\.9 min/);
});

test('PROVEN needs greens on two DISTINCT patients, and a red on a proven entry shows the demotion (D6)', () => {
  const proven = BRIDGE({
    versions: [version(), version({ runid: 'ms2', patient: 'litectx-u', costUsd: 4.71, wallMs: 1_896_000 })],
    history: [row(), row({ runid: 'ms2', patient: 'litectx-u', costUsd: 4.71, wallMs: 1_896_000 })],
  });
  assert.match(renderListing([proven]), /PROVEN/);
  assert.match(renderListing([proven]), /\$2\.21–\$4\.71/, 'the band spans the greens');
  assert.match(renderListing([proven]), /8\.9–31\.6 min/);

  const demoted = { ...proven, history: [...proven.history, row({ runid: 'ms3', patient: 'litectx-u', outcome: 'red', failingStage: 'typecheck', costUsd: 1.1 })] };
  const out = renderListing([demoted]);
  assert.match(out, /CANDIDATE/, 'a red on a PROVEN entry drops it');
  assert.match(out, /1 red/);
  assert.match(out, /last: red/);
});

test('F6: an unpriced green renders UNKNOWN and says how many it skipped — never a $0.00 that reads as exact', () => {
  const unpriced = BRIDGE({
    versions: [version({ costUsd: null, wallMs: null })],
    history: [row({ costUsd: null, wallMs: null, spendComplete: false })],
  });
  const out = renderListing([unpriced]);
  assert.match(out, /UNKNOWN/);
  assert.ok(!out.includes('$0.00'), `a null cost must never render as a floor that reads as exact: ${out}`);
  assert.ok(!/\b0\.0 min\b/.test(out), 'and an unknown duration is never rendered as zero time');

  const partial = BRIDGE({
    versions: [version(), version({ runid: 'ms2', patient: 'litectx-u', costUsd: null, wallMs: null })],
    history: [row(), row({ runid: 'ms2', patient: 'litectx-u', costUsd: null, wallMs: null, spendComplete: false })],
  });
  const p = renderListing([partial]);
  assert.match(p, /\$2\.21/, 'the priced green still reports');
  assert.match(p, /1 of 2 unpriced/, 'and the aggregate says what it skipped');
  assert.match(p, /1 of 2 untimed/);
});

test('a casualty is not a red in the listing either (provider-red rows are never evidence)', () => {
  const withCasualty = BRIDGE({ history: [row(), row({ runid: 'ms9', outcome: 'provider-red', failingStage: null, costUsd: null, spendComplete: false })] });
  const out = renderListing([withCasualty]);
  assert.match(out, /0 red/);
  assert.match(out, /last: provider-red/, 'but the casualty is still shown — the record runs both directions');
});

test('a registry file that could not be read is NAMED, never a silently shorter list', () => {
  const out = renderListing({ ok: false, reds: [{ code: 'entry-invalid', path: '/reg/broken.json', detail: 'unknown-field' }], bridges: [BRIDGE()] });
  assert.match(out, /broken\.json/);
  assert.match(out, /could not be read/i);
  assert.match(out, /NOT listed/i, 'the listing says plainly that it is smaller than the directory');
});

test('an empty registry says so — the caller must be able to tell "nothing to reuse" from "nothing loaded"', () => {
  const out = renderListing({ ok: true, reds: [], bridges: [] });
  assert.match(out, /no workflows/i);
  assert.match(out, /drafted from scratch/i);
  assert.equal(renderListing([]), out, 'a bare empty array reads the same');
});

test('ordering is deterministic regardless of the order the entries arrive in', () => {
  const a = BRIDGE({ name: 'aaa-types' });
  const b = BRIDGE({ name: 'zzz-types' });
  assert.equal(renderListing([a, b]), renderListing([b, a]));
  assert.ok(renderListing([b, a]).indexOf('aaa-types') < renderListing([b, a]).indexOf('zzz-types'));
});

test('renderListing is total: garbage in produces a listing, never a throw', () => {
  for (const junk of [null, undefined, 'nonsense', 42, { bridges: 'not an array' }, [null, 7, {}]]) {
    assert.equal(typeof renderListing(junk), 'string', `threw or returned non-text on ${JSON.stringify(junk)}`);
  }
  // a half-written entry still renders a row, with the unknowns named as unknown
  const out = renderListing([{ name: 'half-written' }]);
  assert.match(out, /half-written/);
  assert.match(out, /UNKNOWN/);
});

test('selectionPrompt carries the ask, the listing, and D3\'s two standing rules', () => {
  const listing = renderListing([BRIDGE()]);
  const p = selectionPrompt(listing, 'Make litectx pass tsc --strict without weakening the tests.');
  assert.ok(p.includes(listing), 'the listing rides verbatim — the picker sees exactly what the human sees');
  assert.ok(p.includes('Make litectx pass tsc --strict without weakening the tests.'));
  assert.match(p, /none/i);
  assert.match(p, /drafts? (a )?new plan/i, 'the "none matches → draft new" exit is stated');
  assert.match(p, /pinned/i);
  assert.match(p, /reason/i, 'a pinned workflow may be refused only explicitly, with a reason');
  // choosing is not authoring (PRD v1.28): the picker is told outright it cannot edit
  // one, so the standing "no user authoring anywhere" line is stated where it binds
  assert.match(p, /choosing, not authoring/i);
  assert.match(p, /cannot edit, merge or invent/i);
});

test('selectionPrompt is pure: the same inputs render the same bytes, and it never mutates them', () => {
  const listing = renderListing([BRIDGE()]);
  const ask = 'Do the thing.';
  assert.equal(selectionPrompt(listing, ask), selectionPrompt(listing, ask));
  assert.equal(ask, 'Do the thing.');
});

test('selectionPrompt on an EMPTY listing still renders — the answer is simply "none"', () => {
  const p = selectionPrompt(renderListing([]), 'Do the thing.');
  assert.match(p, /no workflows/i);
  assert.equal(typeof p, 'string');
});
