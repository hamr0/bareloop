// Item 34 L2 (fix-ledger, 2026-09-05 @ c9f100d): `scripts/run-u.mjs`'s
// `SCOUT_LABEL` used to print "scout ON (default)" for BOTH "no --scout flag
// given" and "--scout on given explicitly" — indistinguishable in printed
// logs/re-invocation lines, which matters for the SCOUT-CONTRAST bench row's
// provenance (an operator/bench-log auditor reading a run's stdout could
// never tell "operator explicitly chose on" from "no flag given" for that
// row). The fix adds a third label state rather than reusing the default's
// wording for an explicit `on`.
//
// `SCOUT_LABEL` is a local const inside `execute()`, src/userrun.js's one
// shared engine (PANEL-BUILD.md P0 moved it off `scripts/run-u.mjs`, now a
// thin adapter, into that engine — it has no export surface for it, and
// spawning the whole runner needs a live job/patient fixture this repo does
// not build for a printed-label test) — so this pins the SOURCE TEXT of the
// ternary that computes it, the same source-text-pin idiom
// `tests/close-timeout.test.js`/`tests/judge-key-demand.test.js` use for
// other run-u internals with no export seam.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');

/** @param {string} src @returns {{noFlag: string, explicitOn: string, explicitOff: string}} */
function extractScoutLabels(src) {
  const m = src.match(
    /const SCOUT_LABEL = scoutArg === null\s*\n\s*\? '([^']*)'\s*\n\s*: \(SCOUT \? '([^']*)' : '([^']*)'\);/,
  );
  assert.ok(m, 'SCOUT_LABEL\'s three-branch ternary moved or was reworded — update this test\'s regex to match');
  return { noFlag: m[1], explicitOn: m[2], explicitOff: m[3] };
}

test('SCOUT_LABEL has three DISTINCT states — no flag, explicit --scout on, explicit --scout off', () => {
  const { noFlag, explicitOn, explicitOff } = extractScoutLabels(SOURCE);
  // the bug this fixes: "no flag" and "explicit on" printing the identical
  // "(default)" text, so a provenance-reading auditor could not tell them apart.
  assert.notEqual(noFlag, explicitOn, 'no-flag and explicit --scout on must print DIFFERENT text');
  assert.match(noFlag, /\(default\)/, 'the true default still says so');
  assert.doesNotMatch(explicitOn, /\(default\)/, 'an operator-chosen "on" must never read as the default');
  assert.match(explicitOn, /--scout on/, 'the explicit-on label must name the flag that produced it');
  // unchanged by this fix — pinned so a future edit does not silently merge
  // this branch back into the default's wording too.
  assert.match(explicitOff, /--scout off/);
});

test('SCOUT_LABEL is read at both print sites this script has (the preview banner and the in-run banner)', () => {
  const sites = [...SOURCE.matchAll(/SCOUT_LABEL/g)];
  // the const's own declaration plus at least two console.log reads
  assert.ok(sites.length >= 3, `expected the declaration plus 2+ reads, found ${sites.length} occurrences`);
});
