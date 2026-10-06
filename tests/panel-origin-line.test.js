// hamr's live click-through 2026-10-05: the long Reuse origin line ran under the absolutely positioned Clear/Abandon button.
// hamr 2026-10-06: the origin line is gone altogether — the Check type radio on "Reuse workflow" plus the picked box say it once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

test('no origin line above the card title; the picked box (name + change) sits under Check type', () => {
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'));
  assert.ok(card.indexOf('id="job-card-title"') < card.indexOf('name="jf-verdict"'));
  assert.doesNotMatch(PAGE, /startfrom-origin|sfOrigin/);
  assert.ok(card.indexOf('name="jf-verdict"') < card.indexOf('id="rw-picked"'));
});
