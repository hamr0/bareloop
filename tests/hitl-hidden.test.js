// Item 34 L19 (hamr, 2026-09-13): `hitl` is removed from every customer-facing
// surface — no revival plans, code kept admitted for reuse only, never shown
// anywhere a customer reads. `bareloop.context.md` is the adopter contract
// (LIBRARY_CONVENTIONS §3, ships with the package); `scripts/run-author.mjs`
// and `scripts/run-interview.mjs` are the two CLI entry points a person runs
// and reads the printed text of. None of the three may name `hitl` any more —
// the class, its terminals, its stage kind — in any casing. The code itself
// (`VERDICT_TYPES`, `human-confirms`, the `hitl-*` terminals) is untouched and
// deliberately not covered by this test: it stays admitted for reuse
// (PRD item 34 L19 table, `docs/logs/FINDINGS.md` item 21 closing ruling).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SURFACES = Object.freeze([
  'bareloop.context.md',
  'scripts/run-author.mjs',
  'scripts/run-interview.mjs',
]);

for (const rel of SURFACES) {
  test(`${rel} names no "hitl" mention (item 34 L19, case-insensitive)`, () => {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const hit = /hitl/i.exec(text);
    assert.equal(hit, null,
      hit
        ? `found "${text.slice(Math.max(0, hit.index - 40), hit.index + 40)}" in ${rel} — hitl must not appear on a customer-facing surface`
        : undefined);
  });
}
