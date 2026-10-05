// hamr's live click-through 2026-10-05: the long Reuse origin line ran under the absolutely positioned Clear/Abandon button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

test('origin line reserves the Clear/Abandon button width on the right, stays bold and first, and wraps', () => {
  const rule = PAGE.match(/\.startfrom-origin\{([^}]*)\}/)[1];
  const pr = rule.match(/padding-right:(\d+)px/);
  assert.ok(pr, 'padding-right reserved');
  assert.ok(Number(pr[1]) >= 110, 'at least the button width (~92px) plus its 10px right offset');
  assert.match(rule, /font-weight:600/);
  assert.match(rule, /overflow-wrap:anywhere/);
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'));
  assert.ok(card.indexOf('id="chat-startfrom-origin"') < card.indexOf('name="jf-verdict"'), 'origin stays first in the card');
});
