// hamr's live click-through 2026-10-05: editable chat fields look as dimmed as locked ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

test('--field-soft-bg token: defined in the dark base and both light blocks, a step below the ask box', () => {
  assert.match(PAGE, /:root\{[^]*?--field-soft-bg:var\(--bg\);[^]*?\}/);
  assert.equal((PAGE.match(/--field-soft-bg:#f7f7f9;/g) || []).length, 2);
  assert.equal((PAGE.match(/--field-bg:#ffffff;/g) || []).length, 2);
});

test('enabled editable chat-card fields use the soft token; the ask box and disabled/readonly fields do not', () => {
  const rules = [...PAGE.matchAll(/([^{}\n]*#panel-chat[^{}]*)\{([^}]*--field-soft-bg[^}]*)\}/g)];
  assert.ok(rules.length >= 1, 'a #panel-chat rule uses --field-soft-bg');
  const sel = rules.map((r) => r[1]).join(',');
  for (const t of ['input', 'select', 'textarea']) assert.match(sel, new RegExp('#panel-chat ' + t));
  assert.match(sel, /:not\(:disabled\)/);
  assert.match(sel, /:not\(\[readonly\]\)/);
  assert.match(sel, /:not\(#chat-msg\)/);
  assert.match(sel, /:not\(\[type="radio"\]\)/);
  // scoped to the Chat tab only
  for (const r of rules) for (const s of r[1].split(',')) assert.match(s, /#panel-chat/);
  // ask box unchanged, base input rule (disabled/locked keep the old colour) unchanged
  assert.match(PAGE.match(/#chat-msg\{([^}]*)\}/)[1], /background:var\(--field-bg\)/);
  assert.match(PAGE, /input,select\{font:inherit;padding:6px 8px;border:1px solid var\(--border-strong\);border-radius:0;background:var\(--bg\);color:var\(--text\);\}/);
});
